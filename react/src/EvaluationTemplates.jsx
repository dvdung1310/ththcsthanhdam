import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Copy, FilePlus2, ListChecks, Lock, Plus, Save, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { formatMoment, formatScore, parseScore } from "./evaluationUtils";
import "./Evaluation.css";

let keySeed = 0;
const newKey = () => `k${++keySeed}`;
const toInput = (value) => (value === null || value === undefined ? "" : String(value).replace(".", ","));

function toDraft(template) {
  return {
    name: template.name,
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

function toPayload(draft) {
  const number = (value) => parseScore(value) ?? 0;
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    grades: draft.grades.map((grade, index) => ({
      code: grade.code || `muc_${index + 1}`,
      name: grade.name.trim(),
      homeroom_min: number(grade.homeroom_min),
      regular_min: number(grade.regular_min),
      clean_required: !!grade.clean_required,
      condition: grade.condition?.trim() || null,
    })),
    sections: draft.sections.map((section) => ({
      code: section.code.trim(),
      title: section.title.trim(),
      max_score: number(section.max_score),
      kind: section.kind,
      homeroom_only: !!section.homeroom_only,
      criteria: section.criteria.map((criterion) => ({
        code: criterion.code.trim(),
        title: criterion.title.trim(),
        guidance: criterion.guidance.trim() || null,
        max_score: number(criterion.max_score),
        requires_evidence: !!criterion.requires_evidence,
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
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState(null);
  const [template, setTemplate] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createDialog, setCreateDialog] = useState(null);

  const loadList = useCallback(async () => {
    try {
      const result = await apiJson("/api/evaluation-templates");
      setTemplates(result.data);
      return result.data;
    } catch (e) {
      setError(e.message);
      return [];
    }
  }, []);

  const selectedId = Number(templateId) || templates?.find((item) => item.is_active)?.id || templates?.[0]?.id || null;

  useEffect(() => {
    loadList();
  }, [loadList]);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    apiJson(`/api/evaluation-templates/${selectedId}`)
      .then((result) => {
        if (!active) return;
        setTemplate(result.data);
        setDraft(toDraft(result.data));
        setDirty(false);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [selectedId]);
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(timer);
  }, [success]);
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

  const update = (change) => {
    setDraft((current) => change(current));
    setDirty(true);
  };
  const updateSection = (key, change) => update((d) => ({ ...d, sections: d.sections.map((s) => (s.key === key ? change(s) : s)) }));
  const updateCriterion = (sectionKey, key, change) =>
    updateSection(sectionKey, (s) => ({ ...s, criteria: s.criteria.map((c) => (c.key === key ? change(c) : c)) }));

  const select = async (id) => {
    if (id === selectedId) return;
    if (dirty && !(await confirm({ tone: "danger", title: "Bỏ thay đổi chưa lưu?", message: "Những chỉnh sửa trên bộ tiêu chí hiện tại sẽ mất.", confirmText: "Bỏ thay đổi" }))) return;
    setDirty(false);
    navigate(`/evaluations/templates/${id}`);
  };

  const applyResult = async (result) => {
    setError("");
    setTemplate(result.data);
    setDraft(toDraft(result.data));
    setDirty(false);
    setSuccess(result.message);
    await loadList();
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await applyResult(await apiJson(`/api/evaluation-templates/${template.id}`, { method: "PUT", body: toPayload(draft) }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const activate = async () => {
    if (dirty) {
      setError("Hãy lưu thay đổi trước khi áp dụng.");
      return;
    }
    const ok = await confirm({
      title: `Áp dụng “${template.name}”?`,
      message: "Các kỳ đánh giá mở từ bây giờ sẽ dùng bộ tiêu chí này. Các kỳ đã mở vẫn giữ bộ tiêu chí cũ.",
      confirmText: "Áp dụng",
    });
    if (!ok) return;
    try {
      await applyResult(await apiJson(`/api/evaluation-templates/${template.id}/activate`, { method: "POST" }));
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    const ok = await confirm({ tone: "danger", title: `Xóa “${template.name}”?`, message: "Bộ tiêu chí chưa dùng cho kỳ nào sẽ bị xóa hẳn.", confirmText: "Xóa" });
    if (!ok) return;
    try {
      const result = await apiJson(`/api/evaluation-templates/${template.id}`, { method: "DELETE" });
      setSuccess(result.message);
      setDirty(false);
      await loadList();
      navigate("/evaluations/templates", { replace: true });
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

  return (
    <div className="ev-page">
      {success && (
        <div className="success-toast" role="status">
          <span><CheckCircle2 size={20} /></span>
          <div><b>Thành công</b><small>{success}</small></div>
          <button onClick={() => setSuccess("")}><X size={17} /></button>
        </div>
      )}
      <section className="ev-hero">
        <p>Bộ tiêu chí đang áp dụng được dùng cho các kỳ mở sau. Kỳ đã mở luôn giữ bộ tiêu chí của nó.</p>
        <button className="primary-btn" onClick={() => setCreateDialog({ copyFrom: "" })}><FilePlus2 size={16} /> Tạo bộ tiêu chí</button>
      </section>
      {error && (
        <div className="api-error">
          <TriangleAlert size={16} />
          {error}
          <button onClick={() => setError("")}>Đóng</button>
        </div>
      )}

      <div className="ev-tpl-layout">
        <aside className="ev-card ev-tpl-list">
          <h3>Bộ tiêu chí</h3>
          {!templates ? (
            <p className="ev-muted">Đang tải...</p>
          ) : (
            templates.map((item) => (
              <button key={item.id} className={item.id === selectedId ? "active" : ""} onClick={() => select(item.id)}>
                <b>{item.name}</b>
                <span className="ev-tpl-badges">
                  {item.is_active && <span className="ev-chip green">Đang áp dụng</span>}
                  {item.periods_count > 0 ? <span className="ev-chip muted">Đã dùng {item.periods_count} kỳ</span> : !item.is_active && <span className="ev-chip orange">Nháp</span>}
                </span>
                <small>{item.criteria_count} tiêu chí · cập nhật {formatMoment(item.updated_at)}</small>
              </button>
            ))
          )}
        </aside>

        {!draft || !template ? (
          <section className="ev-card"><div className="empty-state"><ListChecks className="loading-icon" size={30} /><b>Đang tải...</b></div></section>
        ) : (
          <section className="ev-tpl-editor">
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
              <div className="ev-tpl-actions">
                {template.is_active ? <span className="ev-chip green"><ShieldCheck size={13} /> Đang áp dụng</span> : null}
                <button className="secondary-btn" onClick={() => setCreateDialog({ copyFrom: template.id, name: `${template.name} (bản sao)` })}><Copy size={15} /> Nhân bản</button>
                {!template.is_active && !locked && <button className="secondary-btn danger" onClick={remove}><Trash2 size={15} /> Xóa</button>}
                {!template.is_active && <button className="secondary-btn" onClick={activate}><ShieldCheck size={15} /> Áp dụng</button>}
                <button className="primary-btn" disabled={!dirty || saving} onClick={save}><Save size={15} /> {saving ? "Đang lưu..." : "Lưu"}</button>
              </div>
            </div>

            {locked && (
              <div className="ev-notice warn">
                <Lock size={14} /> Bộ tiêu chí đã dùng cho {template.periods_count} kỳ đánh giá nên chỉ sửa được tên và mô tả. Muốn thay đổi tiêu chí, hãy <b>Nhân bản</b> để tạo bộ mới.
              </div>
            )}

            <div className="ev-card ev-tpl-totals">
              <div><small>Điểm tối đa GVCN</small><b>{formatScore(analysis.totals.homeroom)}</b></div>
              <div><small>Điểm tối đa không chủ nhiệm</small><b>{formatScore(analysis.totals.regular)}</b></div>
              <div><small>Điểm cộng tối đa</small><b>+{formatScore(analysis.totals.bonus)}</b></div>
              {analysis.problems.length > 0 ? (
                <ul className="ev-tpl-problems">{analysis.problems.map((problem, index) => <li key={index}><TriangleAlert size={13} /> {problem}</li>)}</ul>
              ) : (
                <p className="ev-tpl-ok"><CheckCircle2 size={14} /> Bộ tiêu chí hợp lệ, có thể áp dụng.</p>
              )}
            </div>

            <GradeEditor draft={draft} locked={locked} update={update} totals={analysis.totals} />

            {draft.sections.map((section, index) => (
              <div key={section.key} className={`ev-card ev-tpl-section ${section.kind}`}>
                <div className="ev-tpl-section-head">
                  <input className="code" value={section.code} disabled={locked} placeholder="Mã" onChange={(e) => updateSection(section.key, (s) => ({ ...s, code: e.target.value }))} />
                  <input className="title" value={section.title} disabled={locked} placeholder="Tên mục (VD: Nền nếp, tác phong)" onChange={(e) => updateSection(section.key, (s) => ({ ...s, title: e.target.value }))} />
                  <select value={section.kind} disabled={locked} onChange={(e) => updateSection(section.key, (s) => ({ ...s, kind: e.target.value }))}>
                    <option value="score">Mục chấm điểm</option>
                    <option value="bonus">Điểm cộng</option>
                  </select>
                  <label className="max">
                    {section.kind === "bonus" ? "Cộng tối đa" : "Tối đa"}
                    <input value={section.max_score} disabled={locked} inputMode="decimal" onChange={(e) => updateSection(section.key, (s) => ({ ...s, max_score: e.target.value }))} />
                  </label>
                  <label className="ev-check">
                    <input type="checkbox" checked={section.homeroom_only} disabled={locked} onChange={(e) => updateSection(section.key, (s) => ({ ...s, homeroom_only: e.target.checked }))} />
                    Chỉ GVCN
                  </label>
                  {!locked && (
                    <span className="ev-tpl-tools">
                      <button type="button" title="Lên" disabled={index === 0} onClick={() => update((d) => ({ ...d, sections: move(d.sections, index, -1) }))}><ArrowUp size={14} /></button>
                      <button type="button" title="Xuống" disabled={index === draft.sections.length - 1} onClick={() => update((d) => ({ ...d, sections: move(d.sections, index, 1) }))}><ArrowDown size={14} /></button>
                      <button type="button" title="Xóa mục" className="danger" onClick={() => removeSection(section)}><Trash2 size={14} /></button>
                    </span>
                  )}
                </div>
                <div className="ev-tpl-criteria">
                  {section.criteria.map((criterion, criterionIndex) => (
                    <CriterionEditor
                      key={criterion.key}
                      criterion={criterion}
                      bonus={section.kind === "bonus"}
                      locked={locked}
                      first={criterionIndex === 0}
                      last={criterionIndex === section.criteria.length - 1}
                      onChange={(change) => updateCriterion(section.key, criterion.key, change)}
                      onMove={(step) => updateSection(section.key, (s) => ({ ...s, criteria: move(s.criteria, criterionIndex, step) }))}
                      onRemove={() => updateSection(section.key, (s) => ({ ...s, criteria: s.criteria.filter((c) => c.key !== criterion.key) }))}
                    />
                  ))}
                  {!locked && (
                    <button type="button" className="ev-tpl-add" onClick={() => addCriterion(section.key)}><Plus size={14} /> Thêm tiêu chí</button>
                  )}
                </div>
              </div>
            ))}
            {!locked && <button type="button" className="ev-tpl-add section" onClick={addSection}><Plus size={15} /> Thêm mục</button>}
          </section>
        )}
      </div>

      {createDialog && (
        <CreateDialog
          dialog={createDialog}
          templates={templates ?? []}
          onClose={() => setCreateDialog(null)}
          onCreated={async (result) => {
            setCreateDialog(null);
            setSuccess(result.message);
            setDirty(false);
            await loadList();
            navigate(`/evaluations/templates/${result.data.id}`);
          }}
        />
      )}
    </div>
  );
}

function GradeEditor({ draft, locked, update, totals }) {
  const setGrade = (key, field, value) => update((d) => ({ ...d, grades: d.grades.map((g) => (g.key === key ? { ...g, [field]: value } : g)) }));
  return (
    <div className="ev-card ev-tpl-grades">
      <header>
        <h3>Khung xếp loại</h3>
        <small>Xếp từ cao xuống thấp. Hệ thống chọn mức đầu tiên mà tổng điểm đạt ngưỡng (GVCN tối đa {formatScore(totals.homeroom)}, không chủ nhiệm {formatScore(totals.regular)}).</small>
      </header>
      <table>
        <thead>
          <tr>
            <th>Xếp loại</th>
            <th>Ngưỡng GVCN</th>
            <th>Ngưỡng không CN</th>
            <th>Không vi phạm</th>
            <th>Điều kiện</th>
            {!locked && <th aria-label="Thao tác" />}
          </tr>
        </thead>
        <tbody>
          {draft.grades.map((grade, index) => (
            <tr key={grade.key}>
              <td><input value={grade.name} disabled={locked} placeholder="VD: Loại A (Tốt)" onChange={(e) => setGrade(grade.key, "name", e.target.value)} /></td>
              <td><input className="num" inputMode="decimal" value={grade.homeroom_min} disabled={locked} onChange={(e) => setGrade(grade.key, "homeroom_min", e.target.value)} /></td>
              <td><input className="num" inputMode="decimal" value={grade.regular_min} disabled={locked} onChange={(e) => setGrade(grade.key, "regular_min", e.target.value)} /></td>
              <td className="center"><input type="checkbox" checked={!!grade.clean_required} disabled={locked} onChange={(e) => setGrade(grade.key, "clean_required", e.target.checked)} title="Bắt buộc không vi phạm QCCM, đạo đức nhà giáo" /></td>
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
          onClick={() => update((d) => ({ ...d, grades: [...d.grades, { key: newKey(), code: "", name: "", homeroom_min: "", regular_min: "", clean_required: false, condition: "" }] }))}
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
        <label className="ev-check" title="Giáo viên phải đính kèm minh chứng khi chấm tiêu chí này">
          <input type="checkbox" checked={!!criterion.requires_evidence} disabled={locked} onChange={(e) => onChange((c) => ({ ...c, requires_evidence: e.target.checked }))} />
          Cần minh chứng
        </label>
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
      onCreated(await apiJson("/api/evaluation-templates", { method: "POST", body: { name: name.trim(), copy_from_id: copyFrom ? Number(copyFrom) : null } }));
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ev-dialog" onSubmit={submit}>
        <h3>{dialog.copyFrom ? "Nhân bản bộ tiêu chí" : "Tạo bộ tiêu chí"}</h3>
        <label>
          Tên bộ tiêu chí
          <input autoFocus value={name} maxLength={255} onChange={(e) => setName(e.target.value)} placeholder="VD: Tiêu chí thi đua điều chỉnh HK2" />
        </label>
        <label>
          Sao chép từ
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Không — bắt đầu từ bộ trống</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        <p className="ev-dialog-note">Bộ mới ở trạng thái nháp, chưa ảnh hưởng tới kỳ nào. Sửa xong, bấm “Áp dụng” để các kỳ mở sau dùng bộ này.</p>
        {error && <p className="dl-dialog-error">{error}</p>}
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose}>Hủy</button>
          <button className="primary-btn" disabled={saving || !name.trim()}>{saving ? "Đang tạo..." : dialog.copyFrom ? "Nhân bản" : "Tạo"}</button>
        </footer>
      </form>
    </div>
  );
}
