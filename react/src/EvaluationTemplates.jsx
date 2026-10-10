import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarOff, ChevronRight, Paperclip, Pencil, Search, CheckCircle2, ChevronDown, Copy, FilePlus2, ListChecks, Lock, Plus, Save, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { formatMoment, formatScore, parseScore } from "./evaluationUtils";
import TablePagination, { usePagination } from "./TablePagination";
import "./Evaluation.css";
import Avatar from "./Avatar";
import Dropdown from "./Dropdown";

let keySeed = 0;
const newKey = () => `k${++keySeed}`;
const toInput = (value) => (value === null || value === undefined ? "" : String(value).replace(".", ","));
const AUDIENCES = [
  ["teacher", "Giáo viên"],
  ["staff", "Nhân viên"],
  ["leadership", "Ban giám hiệu"],
];
const AUDIENCE_LABELS = Object.fromEntries(AUDIENCES);
const AUDIENCE_NOUNS = { teacher: "giáo viên", staff: "nhân viên", leadership: "Ban giám hiệu" };

function toDraft(template) {
  return {
    name: template.name,
    audience: template.audience ?? "teacher",
    description: template.description ?? "",
    grades: template.grades.map((grade) => ({ ...grade, key: newKey(), homeroom_min: toInput(grade.homeroom_min), regular_min: toInput(grade.regular_min) })),
    sections: template.sections.map((section) => ({
      ...section,
      key: newKey(),
      max_score: toInput(section.max_score),
      criteria: section.criteria.map((criterion) => ({ ...criterion, key: newKey(), guidance: criterion.guidance ?? "", max_score: toInput(criterion.max_score) })),
    })),
  };
}

const gradeSlug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16) || "muc";

function gradeCodes(grades) {
  const used = new Set(grades.map((grade) => grade.code).filter(Boolean));
  return grades.map((grade) => {
    if (grade.code) return grade.code;
    const base = gradeSlug(grade.name);
    let code = base;
    for (let suffix = 2; used.has(code); suffix += 1) code = `${base.slice(0, 16)}_${suffix}`;
    used.add(code);
    return code;
  });
}

function toPayload(draft) {
  const number = (value) => parseScore(value) ?? 0;
  const codes = gradeCodes(draft.grades);
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    grades: draft.grades.map((grade, index) => ({
      code: codes[index],
      name: grade.name.trim(),
      homeroom_min: number(grade.homeroom_min),
      regular_min: draft.audience === "teacher" ? number(grade.regular_min) : number(grade.homeroom_min),
      clean_required: !!grade.clean_required,
      requires_no_zero: !!grade.requires_no_zero,
      condition: grade.condition?.trim() || null,
    })),
    sections: draft.sections.map((section) => ({
      code: section.code.trim(),
      title: section.title.trim(),
      max_score: number(section.max_score),
      kind: section.kind,
      homeroom_only: draft.audience === "teacher" && !!section.homeroom_only,
      criteria: section.criteria.map((criterion) => ({
        code: criterion.code.trim(),
        title: criterion.title.trim(),
        guidance: criterion.guidance.trim() || null,
        max_score: number(criterion.max_score),
        requires_evidence: !!criterion.requires_evidence,
        tracks_leave: section.kind !== "bonus" && !!criterion.tracks_leave,
      })),
    })),
  };
}

function analyse(draft) {
  const number = (value) => parseScore(value) ?? 0;
  const score = draft.sections.filter((section) => section.kind === "score");
  const totals = {
    homeroom: score.reduce((sum, section) => sum + number(section.max_score), 0),
    regular: score.filter((section) => !section.homeroom_only).reduce((sum, section) => sum + number(section.max_score), 0),
    bonus: draft.sections.filter((section) => section.kind === "bonus").reduce((sum, section) => sum + number(section.max_score), 0),
  };
  const problems = [];
  if (!draft.name.trim()) problems.push("Bộ tiêu chí cần có tên.");
  if (!score.length) problems.push("Cần ít nhất một mục chấm điểm.");
  if (!draft.grades.length) problems.push("Cần khai báo khung xếp loại.");
  draft.sections.forEach((section) => {
    const label = section.code || section.title || "chưa đặt tên";
    if (!section.title.trim()) problems.push(`Mục ${label} chưa có tên.`);
    if (!section.criteria.length) problems.push(`Mục ${label} chưa có tiêu chí.`);
    if (section.criteria.some((criterion) => !criterion.title.trim())) problems.push(`Mục ${label} có tiêu chí chưa đặt tên.`);
    const sum = section.criteria.reduce((total, criterion) => total + number(criterion.max_score), 0);
    if (section.kind === "score" && section.criteria.length && Math.abs(sum - number(section.max_score)) > 0.001) {
      problems.push(`Tổng điểm các tiêu chí mục ${label} là ${formatScore(sum)}, chưa bằng ${formatScore(number(section.max_score))}.`);
    }
  });
  const invalid = [...draft.sections, ...draft.sections.flatMap((section) => section.criteria), ...draft.grades].some((item) =>
    ["max_score", "homeroom_min", "regular_min"].some((field) => field in item && Number.isNaN(parseScore(item[field]))),
  );
  if (invalid) problems.push("Có ô điểm nhập không hợp lệ.");
  return { totals, problems };
}

const move = (list, index, step) => {
  const next = [...list];
  const target = index + step;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export default function EvaluationTemplates() {
  const { templateId } = useParams();
  return templateId ? <TemplateDetail key={templateId} id={Number(templateId)} /> : <TemplateList />;
}

function useToast() {
  const location = useLocation();
  const navigate = useNavigate();
  const [success, setSuccess] = useState(location.state?.message ?? "");
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, []);
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(timer);
  }, [success]);
  const toast = success && (
    <div className="success-toast" role="status">
      <span><CheckCircle2 size={20} /></span>
      <div><b>Thành công</b><small>{success}</small></div>
      <button onClick={() => setSuccess("")}><X size={17} /></button>
    </div>
  );
  return [toast, setSuccess];
}

const STATUS_FILTERS = [
  ["", "Mọi trạng thái"],
  ["active", "Đang áp dụng"],
  ["used", "Đã dùng"],
  ["draft", "Nháp"],
];
const templateStatus = (template) => (template.is_active ? "active" : template.periods_count > 0 ? "used" : "draft");

function StatusChips({ template }) {
  return (
    <span className="ev-tpl-badges">
      {template.is_active && <span className="ev-chip green"><ShieldCheck size={12} /> Đang áp dụng</span>}
      {template.periods_count > 0 ? <span className="ev-chip muted">Đã dùng {template.periods_count} kỳ</span> : !template.is_active && <span className="ev-chip orange">Nháp</span>}
    </span>
  );
}

function PersonStamp({ person, at, fallback = "Hệ thống" }) {
  return (
    <span className="ev-stamp">
      {person?.avatar_url ? <img src={person.avatar_url} alt="" /> : <Avatar name={person?.name ?? fallback} />}
      <span>
        <b>{person?.name ?? fallback}</b>
        <small>{formatMoment(at)}</small>
      </span>
    </span>
  );
}

function TemplateList() {
  const navigate = useNavigate();
  const [toast] = useToast();
  const [params, setParams] = useSearchParams();
  const audience = AUDIENCE_LABELS[params.get("audience")] ? params.get("audience") : "teacher";
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [createDialog, setCreateDialog] = useState(null);

  useEffect(() => {
    apiJson("/api/evaluation-templates").then((result) => setTemplates(result.data)).catch((e) => setError(e.message));
  }, []);

  const keyword = search.trim().toLowerCase();
  const filtered = (templates ?? []).filter(
    (item) => item.audience === audience && (!status || templateStatus(item) === status) && (!keyword || `${item.name} ${item.description ?? ""}`.toLowerCase().includes(keyword)),
  );
  const pager = usePagination(filtered);
  const rows = pager.rows;

  return (
    <div className="ev-page">
      {toast}
      <section className="ev-hero">
        <p>Mỗi đối tượng (giáo viên, nhân viên, Ban giám hiệu) có một bộ tiêu chí đang áp dụng riêng, dùng cho các kỳ mở sau. Phiếu đã tạo luôn giữ bộ tiêu chí của nó.</p>
        <button className="primary-btn" onClick={() => setCreateDialog({ copyFrom: "" })}><FilePlus2 size={16} /> Tạo bộ tiêu chí</button>
      </section>
      <div className="ev-segmented ev-tpl-audiences" role="tablist" aria-label="Đối tượng">
        {AUDIENCES.map(([value, label]) => {
          const count = (templates ?? []).filter((item) => item.audience === value).length;
          const active = (templates ?? []).find((item) => item.audience === value && item.is_active);
          return (
            <button key={value} type="button" role="tab" aria-selected={audience === value} className={audience === value ? "active" : ""} onClick={() => { setParams(value === "teacher" ? {} : { audience: value }, { replace: true }); pager.reset(); }}>
              {label} <em>{count}</em>
              {!active && templates && <TriangleAlert size={12} className="ev-text-red" />}
            </button>
          );
        })}
      </div>
      {error && <div className="api-error"><TriangleAlert size={16} />{error}</div>}
      <section className="ev-card">
        <div className="ev-filters ev-tpl-filters">
          <label className="ev-search">
            <Search size={15} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); pager.reset(); }} placeholder="Tìm theo tên hoặc mô tả..." />
          </label>
          <Dropdown label="Trạng thái" value={status} onChange={(value) => { setStatus(String(value)); pager.reset(); }} options={STATUS_FILTERS.map(([value, label]) => ({ value, label }))} />
        </div>
        {!templates ? (
          <div className="empty-state"><ListChecks className="loading-icon" size={30} /><b>Đang tải...</b></div>
        ) : !filtered.length ? (
          <div className="empty-state"><ListChecks size={30} /><b>{templates.length ? "Không có bộ tiêu chí phù hợp" : "Chưa có bộ tiêu chí nào"}</b></div>
        ) : (
          <div className="ev-table-wrap">
            <table className="ev-table ev-tpl-table">
              <thead>
                <tr>
                  <th>Tên bộ tiêu chí</th>
                  <th>Trạng thái</th>
                  <th>Cấu trúc</th>
                  <th>Điểm tối đa</th>
                  <th>Kỳ sử dụng</th>
                  <th>Cập nhật</th>
                  <th aria-label="Mở" />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="clickable" onClick={() => navigate(`/evaluations/templates/${item.id}`)}>
                    <td>
                      <b className="ev-tpl-name">{item.name}</b>
                      {item.description && <small className="ev-sub ev-clip">{item.description}</small>}
                    </td>
                    <td><StatusChips template={item} /></td>
                    <td>{item.sections_count} mục<small className="ev-sub">{item.criteria_count} tiêu chí</small></td>
                    <td>
                      {item.audience === "teacher" ? `${formatScore(item.totals.homeroom)} / ${formatScore(item.totals.regular)}` : formatScore(item.totals.regular)}
                      <small className="ev-sub">{item.audience === "teacher" ? "GVCN / không CN · " : "Cơ bản · "}+{formatScore(item.totals.bonus)} cộng</small>
                    </td>
                    <td>
                      {item.periods.length ? (
                        <>
                          {item.periods[0].label}
                          {item.periods.length > 1 && <small className="ev-sub">đến {item.periods.at(-1).label}</small>}
                        </>
                      ) : (
                        <span className="ev-muted">Chưa dùng</span>
                      )}
                    </td>
                    <td><PersonStamp person={item.updated_by ?? item.created_by} at={item.updated_at} /></td>
                    <td className="ev-row-arrow"><ChevronRight size={18} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination pager={pager} noun="bộ tiêu chí" />
      </section>
      {createDialog && (
        <CreateDialog
          dialog={{ ...createDialog, audience }}
          templates={(templates ?? []).filter((item) => item.audience === audience)}
          onClose={() => setCreateDialog(null)}
          onCreated={(result) => navigate(`/evaluations/templates/${result.data.id}`, { state: { edit: true, message: result.message } })}
        />
      )}
    </div>
  );
}

function TemplateDetail({ id }) {
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const [toast, setSuccess] = useToast();
  const [template, setTemplate] = useState(null);
  const [draft, setDraft] = useState(null);
  const [mode, setMode] = useState(location.state?.edit ? "edit" : "view");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createDialog, setCreateDialog] = useState(null);

  useEffect(() => {
    apiJson(`/api/evaluation-templates/${id}`)
      .then((result) => {
        setTemplate(result.data);
        setDraft(toDraft(result.data));
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const analysis = useMemo(() => (draft ? analyse(draft) : null), [draft]);
  const locked = template?.locked;
  const editing = mode === "edit";
  const fullEdit = editing && !locked;

  const update = (change) => {
    setDraft((current) => change(current));
    setDirty(true);
  };
  const updateSection = (key, change) => update((d) => ({ ...d, sections: d.sections.map((s) => (s.key === key ? change(s) : s)) }));
  const updateCriterion = (sectionKey, key, change) =>
    updateSection(sectionKey, (s) => ({ ...s, criteria: s.criteria.map((c) => (c.key === key ? change(c) : c)) }));

  const applyResult = (result) => {
    setError("");
    setTemplate(result.data);
    setDraft(toDraft(result.data));
    setDirty(false);
    setSuccess(result.message);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      applyResult(await apiJson(`/api/evaluation-templates/${template.id}`, { method: "PUT", body: toPayload(draft) }));
      setMode("view");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = async () => {
    if (dirty && !(await confirm({ tone: "danger", title: "Hủy thay đổi?", message: "Những chỉnh sửa chưa lưu sẽ mất.", confirmText: "Hủy thay đổi" }))) return;
    setDraft(toDraft(template));
    setDirty(false);
    setError("");
    setMode("view");
  };

  const activate = async () => {
    const ok = await confirm({
      title: `Áp dụng “${template.name}”?`,
      message: `Phiếu ${AUDIENCE_NOUNS[template.audience]} tạo từ bây giờ sẽ dùng bộ tiêu chí này. Phiếu đã tạo vẫn giữ bộ tiêu chí cũ.`,
      confirmText: "Áp dụng",
    });
    if (!ok) return;
    try {
      applyResult(await apiJson(`/api/evaluation-templates/${template.id}/activate`, { method: "POST" }));
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    const ok = await confirm({ tone: "danger", title: `Xóa “${template.name}”?`, message: "Bộ tiêu chí chưa dùng cho kỳ nào sẽ bị xóa hẳn.", confirmText: "Xóa" });
    if (!ok) return;
    try {
      const result = await apiJson(`/api/evaluation-templates/${template.id}`, { method: "DELETE" });
      navigate(`/evaluations/templates${template.audience === "teacher" ? "" : `?audience=${template.audience}`}`, { replace: true, state: { message: result.message } });
    } catch (e) {
      setError(e.message);
    }
  };

  const addSection = () =>
    update((d) => ({
      ...d,
      sections: [...d.sections, { key: newKey(), code: "", title: "", max_score: "", kind: "score", homeroom_only: false, criteria: [] }],
    }));
  const addCriterion = (sectionKey) =>
    updateSection(sectionKey, (s) => ({
      ...s,
      criteria: [...s.criteria, { key: newKey(), code: String(s.criteria.length + 1), title: "", guidance: "", max_score: s.kind === "bonus" ? s.max_score : "", requires_evidence: s.kind === "bonus" }],
    }));
  const removeSection = async (section) => {
    if (section.criteria.length && !(await confirm({ tone: "danger", title: `Xóa mục “${section.title || section.code}”?`, message: `Mục này có ${section.criteria.length} tiêu chí.`, confirmText: "Xóa mục" }))) return;
    update((d) => ({ ...d, sections: d.sections.filter((s) => s.key !== section.key) }));
  };

  if (!template || !draft) {
    return (
      <div className="ev-page">
        {error ? <div className="api-error"><TriangleAlert size={16} />{error}<Link to="/evaluations/templates">Quay lại</Link></div> : <div className="empty-state"><ListChecks className="loading-icon" size={30} /><b>Đang tải...</b></div>}
      </div>
    );
  }

  const problems = editing ? analysis.problems : template.problems;

  return (
    <div className="ev-page">
      {toast}
      <section className="ev-tpl-title">
        <Link className="ev-back" to={`/evaluations/templates${template.audience === "teacher" ? "" : `?audience=${template.audience}`}`}><ArrowLeft size={16} /> Bộ tiêu chí</Link>
        <div>
          <h2>{template.name}</h2>
          <span className="ev-chip purple">{template.audience_label}</span>
          <StatusChips template={template} />
        </div>
        {!editing && (
          <div className="ev-tpl-actions">
            <button className="secondary-btn" onClick={() => setCreateDialog({ copyFrom: template.id, name: `${template.name} (bản sao)`, audience: template.audience })}><Copy size={15} /> Nhân bản</button>
            {!template.is_active && !locked && <button className="secondary-btn danger" onClick={remove}><Trash2 size={15} /> Xóa</button>}
            {!template.is_active && !template.problems.length && <button className="secondary-btn" onClick={activate}><ShieldCheck size={15} /> Áp dụng</button>}
            <button className="primary-btn" onClick={() => setMode("edit")}><Pencil size={15} /> {locked ? "Sửa tên & mô tả" : "Chỉnh sửa"}</button>
          </div>
        )}
      </section>
      {editing && (
        <div className="ev-savebar">
          <span>{dirty ? "Có thay đổi chưa lưu" : "Đang chỉnh sửa"}</span>
          <button className="secondary-btn" onClick={cancelEdit} disabled={saving}>Hủy</button>
          <button className="primary-btn" onClick={save} disabled={!dirty || saving}><Save size={15} /> {saving ? "Đang lưu..." : "Lưu"}</button>
        </div>
      )}
      {error && (
        <div className="api-error">
          <TriangleAlert size={16} />
          {error}
          <button onClick={() => setError("")}>Đóng</button>
        </div>
      )}
      {editing && locked && (
        <div className="ev-notice warn">
          <Lock size={14} /> Bộ tiêu chí đã dùng cho {template.periods_count} kỳ đánh giá nên chỉ sửa được tên và mô tả. Muốn thay đổi tiêu chí, hãy <b>Nhân bản</b> để tạo bộ mới.
        </div>
      )}

      <div className="ev-sheet-layout">
        <div className="ev-sheet-main">
          {editing ? (
            <div className="ev-card ev-tpl-head">
              <div className="ev-tpl-fields">
                <label>
                  Tên bộ tiêu chí
                  <input value={draft.name} maxLength={255} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} />
                </label>
                <label>
                  Mô tả
                  <textarea rows={2} value={draft.description} onChange={(e) => update((d) => ({ ...d, description: e.target.value }))} placeholder="VD: Áp dụng từ học kỳ II theo dự thảo của Hội đồng thi đua" />
                </label>
              </div>
            </div>
          ) : (
            template.description && <div className="ev-card ev-tpl-desc">{template.description}</div>
          )}

          {fullEdit ? (
            <>
              <GradeEditor draft={draft} locked={false} update={update} totals={analysis.totals} teacher={draft.audience === "teacher"} />
              {draft.sections.map((section, index) => (
                <div key={section.key} className={`ev-card ev-tpl-section ${section.kind}`}>
                  <div className="ev-tpl-section-head">
                    <input className="code" value={section.code} placeholder="Mã" onChange={(e) => updateSection(section.key, (s) => ({ ...s, code: e.target.value }))} />
                    <input className="title" value={section.title} placeholder="Tên mục (VD: Nền nếp, tác phong)" onChange={(e) => updateSection(section.key, (s) => ({ ...s, title: e.target.value }))} />
                    <Dropdown
                      field
                      className="kind"
                      label="Loại mục"
                      value={section.kind}
                      onChange={(value) => updateSection(section.key, (s) => ({ ...s, kind: value }))}
                      options={[{ value: "score", label: "Mục chấm điểm" }, { value: "bonus", label: "Điểm cộng" }]}
                    />
                    <label className="max">
                      {section.kind === "bonus" ? "Cộng tối đa" : "Tối đa"}
                      <input value={section.max_score} inputMode="decimal" onChange={(e) => updateSection(section.key, (s) => ({ ...s, max_score: e.target.value }))} />
                    </label>
                    {draft.audience === "teacher" && (
                      <label className="ev-check">
                        <input type="checkbox" checked={section.homeroom_only} onChange={(e) => updateSection(section.key, (s) => ({ ...s, homeroom_only: e.target.checked }))} />
                        Chỉ GVCN
                      </label>
                    )}
                    <span className="ev-tpl-tools">
                      <button type="button" title="Lên" disabled={index === 0} onClick={() => update((d) => ({ ...d, sections: move(d.sections, index, -1) }))}><ArrowUp size={14} /></button>
                      <button type="button" title="Xuống" disabled={index === draft.sections.length - 1} onClick={() => update((d) => ({ ...d, sections: move(d.sections, index, 1) }))}><ArrowDown size={14} /></button>
                      <button type="button" title="Xóa mục" className="danger" onClick={() => removeSection(section)}><Trash2 size={14} /></button>
                    </span>
                  </div>
                  <div className="ev-tpl-criteria">
                    {section.criteria.map((criterion, criterionIndex) => (
                      <CriterionEditor
                        key={criterion.key}
                        criterion={criterion}
                        bonus={section.kind === "bonus"}
                        locked={false}
                        first={criterionIndex === 0}
                        last={criterionIndex === section.criteria.length - 1}
                        onChange={(change) => updateCriterion(section.key, criterion.key, change)}
                        onMove={(step) => updateSection(section.key, (s) => ({ ...s, criteria: move(s.criteria, criterionIndex, step) }))}
                        onRemove={() => updateSection(section.key, (s) => ({ ...s, criteria: s.criteria.filter((c) => c.key !== criterion.key) }))}
                      />
                    ))}
                    <button type="button" className="ev-tpl-add" onClick={() => addCriterion(section.key)}><Plus size={14} /> Thêm tiêu chí</button>
                  </div>
                </div>
              ))}
              <button type="button" className="ev-tpl-add section" onClick={addSection}><Plus size={15} /> Thêm mục</button>
            </>
          ) : (
            <>
              <GradeView grades={template.grades} totals={template.totals} teacher={template.audience === "teacher"} />
              {template.sections.map((section) => <SectionView key={section.id} section={section} />)}
              {!template.sections.length && <div className="ev-card"><div className="empty-state"><ListChecks size={28} /><b>Chưa có mục nào</b><span>Bấm “Chỉnh sửa” để thêm mục và tiêu chí.</span></div></div>}
            </>
          )}
        </div>

        <aside className="ev-summary">
          <div className="ev-card ev-summary-card ev-tpl-info">
            <h3>Thông tin</h3>
            <dl>
              <dt>Đối tượng</dt>
              <dd>{template.audience_label} <small>Cột chấm thứ hai: {template.scorer_label}</small></dd>
              <dt>Trạng thái</dt>
              <dd><StatusChips template={template} /></dd>
              <dt>Điểm tối đa</dt>
              <dd>
                {template.audience === "teacher"
                  ? `${formatScore((editing ? analysis : template).totals.homeroom)} GVCN · ${formatScore((editing ? analysis : template).totals.regular)} không CN`
                  : `${formatScore((editing ? analysis : template).totals.regular)} điểm cơ bản`}
                <small>Điểm cộng tối đa +{formatScore((editing ? analysis : template).totals.bonus)}</small>
              </dd>
              <dt>Cấu trúc</dt>
              <dd>{template.sections_count} mục · {template.criteria_count} tiêu chí</dd>
              <dt>Người tạo</dt>
              <dd><PersonStamp person={template.created_by} at={template.created_at} /></dd>
              <dt>Cập nhật cuối</dt>
              <dd><PersonStamp person={template.updated_by ?? template.created_by} at={template.updated_at} /></dd>
              {template.activated_at && (
                <>
                  <dt>Áp dụng</dt>
                  <dd><PersonStamp person={template.activated_by} at={template.activated_at} /></dd>
                </>
              )}
              <dt>Kỳ sử dụng</dt>
              <dd>
                {template.periods.length ? (
                  <span className="ev-tpl-periods">
                    {template.periods.map((period) => (
                      <Link key={period.id} to={`/evaluations?tab=board&period=${period.id}`}>{period.label} <ChevronRight size={13} /></Link>
                    ))}
                  </span>
                ) : (
                  <span className="ev-muted">Chưa dùng cho kỳ nào</span>
                )}
              </dd>
            </dl>
            {problems.length > 0 ? (
              <ul className="ev-tpl-problems">{problems.map((problem, index) => <li key={index}><TriangleAlert size={13} /> {problem}</li>)}</ul>
            ) : (
              <p className="ev-tpl-ok"><CheckCircle2 size={14} /> Hợp lệ, có thể áp dụng.</p>
            )}
          </div>
        </aside>
      </div>


      {createDialog && (
        <CreateDialog
          dialog={createDialog}
          templates={[template]}
          onClose={() => setCreateDialog(null)}
          onCreated={(result) => {
            setCreateDialog(null);
            navigate(`/evaluations/templates/${result.data.id}`, { state: { edit: true, message: result.message } });
          }}
        />
      )}
    </div>
  );
}

function GradeView({ grades, totals, teacher }) {
  return (
    <div className="ev-card ev-tpl-grades">
      <header>
        <h3>Khung xếp loại</h3>
        <small>
          Hệ thống chọn mức đầu tiên từ trên xuống mà tổng điểm đạt ngưỡng
          {teacher ? ` (GVCN tối đa ${formatScore(totals.homeroom)}, không chủ nhiệm ${formatScore(totals.regular)}).` : ` (tối đa ${formatScore(totals.regular)} điểm cơ bản).`}
        </small>
      </header>
      {grades.length ? (
        <table>
          <thead>
            <tr>
              <th>Xếp loại</th>
              {teacher ? (
                <>
                  <th>Ngưỡng GVCN</th>
                  <th>Ngưỡng không CN</th>
                </>
              ) : (
                <th>Ngưỡng</th>
              )}
              <th>Điều kiện</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((grade) => (
              <tr key={grade.code}>
                <td><b>{grade.name}</b></td>
                <td>Từ {formatScore(grade.homeroom_min)}</td>
                {teacher && <td>Từ {formatScore(grade.regular_min)}</td>}
                <td>
                  {grade.condition || "—"}
                  {grade.clean_required && <small className="ev-sub">{teacher ? "Bắt buộc không vi phạm QCCM, đạo đức nhà giáo" : "Bắt buộc không có vi phạm đã được kết luận"}</small>}
                  {grade.requires_no_zero && <small className="ev-sub">Không có tiêu chí bị 0 điểm</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="ev-muted">Chưa khai báo khung xếp loại.</p>
      )}
    </div>
  );
}

function SectionView({ section }) {
  return (
    <section className={`ev-card ev-section ev-tpl-view ${section.kind}`}>
      <header>
        <h3><span>{section.code}.</span> {section.title}</h3>
        <small>{section.kind === "bonus" ? `Điểm cộng, tối đa +${formatScore(section.max_score)}` : `Tối đa ${formatScore(section.max_score)} điểm`}</small>
        {section.homeroom_only && <span className="ev-chip purple">Chỉ GVCN</span>}
      </header>
      <div>
        {section.criteria.map((criterion) => <CriterionView key={criterion.id} criterion={criterion} bonus={section.kind === "bonus"} />)}
        {!section.criteria.length && <p className="ev-disabled-note">Chưa có tiêu chí.</p>}
      </div>
    </section>
  );
}

function CriterionView({ criterion, bonus }) {
  const [open, setOpen] = useState(false);
  const lines = (criterion.guidance ?? "").split("\n").filter(Boolean);
  return (
    <div className="ev-tpl-view-row">
      <div className="ev-criterion-title">
        <b>{criterion.code}. {criterion.title}</b>
        <small>{bonus ? `Cộng tối đa ${formatScore(criterion.max_score)}` : `${formatScore(criterion.max_score)} điểm`}</small>
        {criterion.requires_evidence && <span className="ev-chip blue"><Paperclip size={11} /> Cần minh chứng</span>}
        {criterion.tracks_leave && <span className="ev-chip teal"><CalendarOff size={11} /> Gợi ý từ theo dõi nghỉ</span>}
        {lines.length > 0 && (
          <button type="button" className={`ev-guide-toggle ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
            Cách tính điểm <ChevronDown size={13} />
          </button>
        )}
        {open && <ul className="ev-guidance">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
      </div>
    </div>
  );
}

function GradeEditor({ draft, locked, update, totals, teacher }) {
  const setGrade = (key, field, value) => update((d) => ({ ...d, grades: d.grades.map((g) => (g.key === key ? { ...g, [field]: value } : g)) }));
  return (
    <div className="ev-card ev-tpl-grades">
      <header>
        <h3>Khung xếp loại</h3>
        <small>
          Xếp từ cao xuống thấp. Hệ thống chọn mức đầu tiên mà tổng điểm đạt ngưỡng
          {teacher ? ` (GVCN tối đa ${formatScore(totals.homeroom)}, không chủ nhiệm ${formatScore(totals.regular)}).` : ` (tối đa ${formatScore(totals.regular)} điểm cơ bản).`}
        </small>
      </header>
      <table>
        <thead>
          <tr>
            <th>Xếp loại</th>
            {teacher ? (
              <>
                <th>Ngưỡng GVCN</th>
                <th>Ngưỡng không CN</th>
              </>
            ) : (
              <th>Ngưỡng</th>
            )}
            <th>Không vi phạm</th>
            <th>Không tiêu chí 0đ</th>
            <th>Điều kiện</th>
            {!locked && <th aria-label="Thao tác" />}
          </tr>
        </thead>
        <tbody>
          {draft.grades.map((grade, index) => (
            <tr key={grade.key}>
              <td><input value={grade.name} disabled={locked} placeholder="VD: Loại A (Tốt)" onChange={(e) => setGrade(grade.key, "name", e.target.value)} /></td>
              <td><input className="num" inputMode="decimal" value={grade.homeroom_min} disabled={locked} onChange={(e) => setGrade(grade.key, "homeroom_min", e.target.value)} /></td>
              {teacher && <td><input className="num" inputMode="decimal" value={grade.regular_min} disabled={locked} onChange={(e) => setGrade(grade.key, "regular_min", e.target.value)} /></td>}
              <td className="center"><input type="checkbox" checked={!!grade.clean_required} disabled={locked} onChange={(e) => setGrade(grade.key, "clean_required", e.target.checked)} title="Bắt buộc không có vi phạm" /></td>
              <td className="center"><input type="checkbox" checked={!!grade.requires_no_zero} disabled={locked} onChange={(e) => setGrade(grade.key, "requires_no_zero", e.target.checked)} title="Không xếp mức này nếu có tiêu chí bị 0 điểm" /></td>
              <td><input value={grade.condition ?? ""} disabled={locked} placeholder="Điều kiện bắt buộc" onChange={(e) => setGrade(grade.key, "condition", e.target.value)} /></td>
              {!locked && (
                <td className="ev-tpl-tools">
                  <button type="button" title="Lên" disabled={index === 0} onClick={() => update((d) => ({ ...d, grades: move(d.grades, index, -1) }))}><ArrowUp size={14} /></button>
                  <button type="button" title="Xuống" disabled={index === draft.grades.length - 1} onClick={() => update((d) => ({ ...d, grades: move(d.grades, index, 1) }))}><ArrowDown size={14} /></button>
                  <button type="button" title="Xóa" className="danger" onClick={() => update((d) => ({ ...d, grades: d.grades.filter((g) => g.key !== grade.key) }))}><Trash2 size={14} /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!locked && (
        <button
          type="button"
          className="ev-tpl-add"
          onClick={() => update((d) => ({ ...d, grades: [...d.grades, { key: newKey(), code: "", name: "", homeroom_min: "", regular_min: "", clean_required: false, requires_no_zero: false, condition: "" }] }))}
        >
          <Plus size={14} /> Thêm mức xếp loại
        </button>
      )}
    </div>
  );
}

function CriterionEditor({ criterion, bonus, locked, first, last, onChange, onMove, onRemove }) {
  const [open, setOpen] = useState(!criterion.title);
  return (
    <div className="ev-tpl-criterion">
      <div className="ev-tpl-criterion-row">
        <input className="code" value={criterion.code} disabled={locked} placeholder="Mã" onChange={(e) => onChange((c) => ({ ...c, code: e.target.value }))} />
        <input className="title" value={criterion.title} disabled={locked} placeholder="Tên tiêu chí" onChange={(e) => onChange((c) => ({ ...c, title: e.target.value }))} />
        <label className="max">
          {bonus ? "Cộng tối đa" : "Tối đa"}
          <input value={criterion.max_score} disabled={locked} inputMode="decimal" onChange={(e) => onChange((c) => ({ ...c, max_score: e.target.value }))} />
        </label>
        <label className="ev-check" title="Người tự đánh giá phải đính kèm minh chứng khi chấm tiêu chí này">
          <input type="checkbox" checked={!!criterion.requires_evidence} disabled={locked} onChange={(e) => onChange((c) => ({ ...c, requires_evidence: e.target.checked }))} />
          Cần minh chứng
        </label>
        {!bonus && (
          <label className="ev-check" title="Hiện tóm tắt ngày nghỉ trong tháng và gợi ý điểm trừ ở tiêu chí này">
            <input type="checkbox" checked={!!criterion.tracks_leave} disabled={locked} onChange={(e) => onChange((c) => ({ ...c, tracks_leave: e.target.checked }))} />
            Gợi ý từ nghỉ
          </label>
        )}
        <button type="button" className={`ev-guide-toggle ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
          Cách tính điểm <ChevronDown size={13} />
        </button>
        {!locked && (
          <span className="ev-tpl-tools">
            <button type="button" title="Lên" disabled={first} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
            <button type="button" title="Xuống" disabled={last} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
            <button type="button" title="Xóa tiêu chí" className="danger" onClick={onRemove}><Trash2 size={14} /></button>
          </span>
        )}
      </div>
      {open && (
        <textarea
          rows={5}
          value={criterion.guidance}
          disabled={locked}
          onChange={(e) => onChange((c) => ({ ...c, guidance: e.target.value }))}
          placeholder="Nội dung và cách tính điểm, mỗi dòng một ý. VD: Đi muộn dưới 30 phút: trừ 0,5đ/lần."
        />
      )}
    </div>
  );
}

function CreateDialog({ dialog, templates, onClose, onCreated }) {
  const [name, setName] = useState(dialog.name ?? "");
  const [copyFrom, setCopyFrom] = useState(dialog.copyFrom ? String(dialog.copyFrom) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      onCreated(await apiJson("/api/evaluation-templates", { method: "POST", body: { name: name.trim(), audience: dialog.audience ?? "teacher", copy_from_id: copyFrom ? Number(copyFrom) : null } }));
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ev-dialog" onSubmit={submit}>
        <h3>{dialog.copyFrom ? "Nhân bản bộ tiêu chí" : `Tạo bộ tiêu chí ${AUDIENCE_NOUNS[dialog.audience] ?? ""}`}</h3>
        <label>
          Tên bộ tiêu chí
          <input autoFocus value={name} maxLength={255} onChange={(e) => setName(e.target.value)} placeholder="VD: Tiêu chí thi đua điều chỉnh HK2" />
        </label>
        <label>
          Sao chép từ
          <Dropdown
            field
            label="Sao chép từ"
            value={copyFrom}
            onChange={(value) => setCopyFrom(String(value))}
            options={[{ value: "", label: "Không — bắt đầu từ bộ trống" }, { divider: true }, ...templates.map((template) => ({ value: String(template.id), label: template.name }))]}
          />
        </label>
        <p className="ev-dialog-note">Bộ mới ở trạng thái nháp, chưa ảnh hưởng tới kỳ nào. Sửa xong, bấm “Áp dụng” để phiếu tạo sau dùng bộ này.</p>
        {error && <p className="dl-dialog-error">{error}</p>}
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose}>Hủy</button>
          <button className="primary-btn" disabled={saving || !name.trim()}>{saving ? "Đang tạo..." : dialog.copyFrom ? "Nhân bản" : "Tạo"}</button>
        </footer>
      </form>
    </div>
  );
}
