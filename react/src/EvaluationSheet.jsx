import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  FileText,
  ListChecks,
  Paperclip,
  Printer,
  Save,
  Send,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { apiFetch, apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import FilePreview from "./FilePreview";
import { formatBytes } from "./fileUtils";
import { STATUS_TONES, computeTotals, formatDay, formatMoment, formatScore, maxBase, parseScore, suggestGrade } from "./evaluationUtils";
import "./Evaluation.css";

const TASK_STATUS = { not_started: "Chưa thực hiện", in_progress: "Đang thực hiện", waiting_approval: "Chờ duyệt", completed: "Hoàn thành" };
const toInput = (value) => (value === null || value === undefined ? "" : String(value).replace(".", ","));

function buildRows(data) {
  const rows = {};
  data.sections.forEach((section) =>
    section.criteria.forEach((criterion) => {
      rows[criterion.id] = {
        self_score: toInput(criterion.self_score),
        self_note: criterion.self_note ?? "",
        unit_score: toInput(criterion.unit_score),
        unit_note: criterion.unit_note ?? "",
        final_score: toInput(criterion.final_score),
      };
    }),
  );
  return rows;
}

const buildForm = (data) => ({
  is_homeroom: data.is_homeroom,
  duties: data.duties ?? "",
  results: data.results ?? "",
  has_violation: !!data.has_violation,
  no_grade: !!data.no_grade_reason,
  no_grade_reason: data.no_grade_reason ?? "",
  grade: data.grade ?? "",
});

export default function EvaluationSheet() {
  const { evaluationId } = useParams();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [rows, setRows] = useState({});
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState({ self: false, unit: false, review: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState(null);
  const [returning, setReturning] = useState(false);

  const reset = useCallback((detail) => {
    setData(detail);
    setRows(buildRows(detail));
    setForm(buildForm(detail));
    setDirty({ self: false, unit: false, review: false });
  }, []);

  const load = useCallback(async () => {
    try {
      reset((await apiJson(`/api/evaluations/${evaluationId}`)).data);
    } catch (e) {
      setError(e.message);
    }
  }, [evaluationId, reset]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(timer);
  }, [success]);

  const anyDirty = dirty.self || dirty.unit || dirty.review;
  useEffect(() => {
    if (!anyDirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const abilities = data?.abilities ?? {};
  const selfMode = abilities.can_self_score;
  const unitMode = abilities.can_unit_score;
  const reviewMode = abilities.can_review;
  const showUnit = !!data && (data.show_result || unitMode);
  const showFinal = !!data && data.show_result && (reviewMode || data.period.status !== "open" || data.sections.some((s) => s.criteria.some((c) => c.final_score !== null)));
  const isHomeroom = form?.is_homeroom ?? false;

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      self: computeTotals(data.sections, rows, "self", isHomeroom),
      unit: showUnit ? computeTotals(data.sections, rows, "unit", isHomeroom) : null,
      final: showFinal ? computeTotals(data.sections, rows, "final", isHomeroom) : null,
    };
  }, [data, rows, isHomeroom, showUnit, showFinal]);

  const resultColumn = showFinal ? "final" : showUnit ? "unit" : "self";
  const resultTotal = totals?.[resultColumn]?.total ?? 0;
  const suggested = data && !form?.no_grade ? suggestGrade(data.grades, resultTotal, isHomeroom, form?.has_violation) : null;

  const setCell = (criterionId, field, value, group) => {
    setRows((current) => ({ ...current, [criterionId]: { ...current[criterionId], [field]: value } }));
    setDirty((current) => ({ ...current, [group]: true }));
  };
  const setField = (field, value, group) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty((current) => ({ ...current, [group]: true }));
  };

  const invalidCells = (column) =>
    data.sections.flatMap((section) =>
      section.criteria.filter((criterion) => {
        const value = parseScore(rows[criterion.id]?.[`${column}_score`]);
        return value !== null && (Number.isNaN(value) || value < 0 || value > criterion.max_score);
      }),
    );

  const payload = (column, withNote = true) =>
    data.sections.flatMap((section) =>
      section.criteria.map((criterion) => ({
        criterion_id: criterion.id,
        score: parseScore(rows[criterion.id]?.[`${column}_score`]),
        ...(withNote ? { note: rows[criterion.id]?.[`${column}_note`] || null } : {}),
      })),
    );

  const guardInvalid = (column) => {
    const invalid = invalidCells(column);
    if (invalid.length) {
      setError(`Điểm không hợp lệ ở tiêu chí “${invalid[0].title}” (tối đa ${formatScore(invalid[0].max_score)}).`);
      return true;
    }
    return false;
  };

  const save = async (request, message) => {
    setSaving(true);
    setError("");
    try {
      const result = await request();
      reset(result.data);
      setSuccess(message ?? result.message);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveSelf = async (submit = false) => {
    if (guardInvalid("self")) return;
    if (submit) {
      const empty = data.sections
        .filter((s) => s.kind !== "bonus" && (!s.homeroom_only || isHomeroom))
        .flatMap((s) => s.criteria)
        .filter((c) => parseScore(rows[c.id]?.self_score) === null);
      const bonusNoEvidence = data.sections
        .filter((s) => s.kind === "bonus")
        .flatMap((s) => s.criteria)
        .filter((c) => (parseScore(rows[c.id]?.self_score) ?? 0) > 0 && !c.evidence.length);
      const warnings = [
        empty.length ? `${empty.length} tiêu chí chưa chấm (tính là 0 điểm).` : null,
        bonusNoEvidence.length ? `${bonusNoEvidence.length} nội dung điểm cộng chưa có minh chứng.` : null,
      ].filter(Boolean);
      const ok = await confirm({
        tone: warnings.length ? "danger" : undefined,
        title: "Nộp phiếu tự đánh giá?",
        message: [...warnings, "Sau khi nộp, bạn không sửa được phiếu nữa trừ khi tổ trưởng trả về."].join(" "),
        confirmText: "Nộp phiếu",
      });
      if (!ok) return;
    }
    await save(() =>
      apiJson(`/api/evaluations/${data.id}/self`, {
        method: "PUT",
        body: { is_homeroom: form.is_homeroom, duties: form.duties, results: form.results, scores: payload("self"), submit },
      }),
    );
  };

  const saveUnitAndReview = async (complete = false) => {
    if ((unitMode && guardInvalid("unit")) || (reviewMode && guardInvalid("final"))) return;
    if (complete) {
      const empty = data.sections
        .filter((s) => !s.homeroom_only || isHomeroom)
        .filter((s) => s.kind !== "bonus")
        .flatMap((s) => s.criteria)
        .filter((c) => parseScore(rows[c.id]?.unit_score) === null);
      if (empty.length) {
        const ok = await confirm({ tone: "danger", title: "Còn tiêu chí chưa chấm", message: `${empty.length} tiêu chí chưa có điểm tổ chấm và sẽ tính là 0. Vẫn hoàn tất?`, confirmText: "Hoàn tất" });
        if (!ok) return;
      }
    }
    setSaving(true);
    setError("");
    try {
      let result = null;
      if (unitMode && (dirty.unit || complete || !reviewMode)) {
        result = await apiJson(`/api/evaluations/${data.id}/unit`, { method: "PUT", body: { is_homeroom: form.is_homeroom, scores: payload("unit"), complete } });
      }
      if (reviewMode && (dirty.review || !result)) {
        result = await apiJson(`/api/evaluations/${data.id}/review`, {
          method: "PUT",
          body: {
            has_violation: form.has_violation,
            no_grade_reason: form.no_grade ? form.no_grade_reason || "Không xếp loại tháng" : null,
            grade: form.grade || null,
            scores: payload("final", false),
          },
        });
      }
      reset(result.data);
      setSuccess(complete ? "Đã hoàn tất chấm phiếu." : result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const copySelfToUnit = () => {
    setRows((current) => {
      const next = { ...current };
      Object.keys(next).forEach((id) => {
        if (next[id].unit_score === "" && next[id].self_score !== "") next[id] = { ...next[id], unit_score: next[id].self_score };
      });
      return next;
    });
    setDirty((current) => ({ ...current, unit: true }));
  };

  const fillDuties = async () => {
    try {
      const result = await apiJson(`/api/evaluations/${data.id}/duties`);
      if (!result.data.length) {
        setError("Không tìm thấy công việc nào được giao trong tháng này.");
        return;
      }
      const text = result.data.map((task) => `- ${task.code}: ${task.title} (${TASK_STATUS[task.status] ?? task.status})`).join("\n");
      setField("duties", form.duties.trim() ? `${form.duties.trim()}\n${text}` : text, "self");
    } catch (e) {
      setError(e.message);
    }
  };

  const uploadEvidence = async (criterionId, fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const body = new FormData();
    body.append("criterion_id", criterionId);
    files.forEach((file) => body.append("files[]", file));
    try {
      const response = await apiFetch(`/api/evaluations/${data.id}/evidence`, { method: "POST", headers: { Accept: "application/json" }, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Object.values(result.errors ?? {}).flat()[0] ?? result.message ?? "Không tải được minh chứng.");
      setData(result.data);
      setSuccess(result.message);
    } catch (e) {
      setError(e.message);
    }
  };

  const removeEvidence = async (file) => {
    const ok = await confirm({ tone: "danger", title: `Xóa minh chứng “${file.name}”?`, confirmText: "Xóa" });
    if (!ok) return;
    try {
      const result = await apiJson(`/api/evaluations/${data.id}/evidence/${file.id}`, { method: "DELETE" });
      setData(result.data);
    } catch (e) {
      setError(e.message);
    }
  };

  const openEvidence = (criterion, index) =>
    setPreview({
      files: criterion.evidence.map((file) => ({ key: file.id, name: file.name, mime_type: file.mime_type, size: file.size, url: `/api/evaluations/${data.id}/evidence/${file.id}` })),
      index,
    });

  if (!data || !form) {
    return (
      <div className="ev-page">
        {error ? (
          <div className="api-error"><TriangleAlert size={16} />{error}<Link to="/evaluations">Quay lại</Link></div>
        ) : (
          <div className="empty-state"><ListChecks className="loading-icon" size={34} /><b>Đang tải phiếu...</b></div>
        )}
      </div>
    );
  }

  const backTo = abilities.is_own ? "/evaluations" : `/evaluations?tab=board&period=${data.period.id}`;

  return (
    <div className="ev-page ev-sheet-page">
      {success && (
        <div className="success-toast" role="status">
          <span><CheckCircle2 size={20} /></span>
          <div><b>Thành công</b><small>{success}</small></div>
          <button onClick={() => setSuccess("")}><X size={17} /></button>
        </div>
      )}

      <section className="ev-sheet-head">
        <Link className="ev-back" to={backTo}><ArrowLeft size={16} /> Danh sách</Link>
        <div className="ev-sheet-title">
          <span className="ev-person large">
            {data.teacher.avatar_url ? <img src={data.teacher.avatar_url} alt="" /> : <i>{data.teacher.name?.split(" ").at(-1)?.charAt(0)}</i>}
            <span>
              <b>{data.teacher.name}</b>
              <small>{[data.teacher.position, data.teacher.units.join(", ")].filter(Boolean).join(" · ")}</small>
            </span>
          </span>
          <div className="ev-sheet-meta">
            <h2>Đánh giá thi đua {data.period.label}</h2>
            <span className={`ev-chip ${STATUS_TONES[data.status]}`}>{data.status_label}</span>
            {data.period.self_due_on && <small>Hạn tự chấm {formatDay(data.period.self_due_on)}</small>}
          </div>
        </div>
        <div className="ev-sheet-actions">
          <button className="secondary-btn" onClick={() => window.print()}><Printer size={15} /> In phiếu</button>
          {selfMode && (
            <>
              <button className="secondary-btn" disabled={saving} onClick={() => saveSelf(false)}><Save size={15} /> Lưu nháp</button>
              <button className="primary-btn" disabled={saving} onClick={() => saveSelf(true)}><Send size={15} /> Nộp phiếu</button>
            </>
          )}
          {unitMode && (
            <>
              {abilities.can_return && <button className="secondary-btn" disabled={saving} onClick={() => setReturning(true)}><Undo2 size={15} /> Trả phiếu</button>}
              <button className="secondary-btn" disabled={saving} onClick={() => saveUnitAndReview(false)}><Save size={15} /> Lưu điểm</button>
              <button className="primary-btn" disabled={saving} onClick={() => saveUnitAndReview(true)}>
                <CheckCircle2 size={15} /> {data.status === "unit_scored" ? "Cập nhật & hoàn tất" : "Hoàn tất chấm"}
              </button>
            </>
          )}
          {!unitMode && reviewMode && (
            <button className="primary-btn" disabled={saving} onClick={() => saveUnitAndReview(false)}><Save size={15} /> Lưu duyệt</button>
          )}
        </div>
      </section>

      {error && (
        <div className="api-error">
          <TriangleAlert size={16} />
          {error}
          <button onClick={() => setError("")}>Đóng</button>
        </div>
      )}
      {abilities.is_own && !data.show_result && data.status !== "draft" && (
        <div className="ev-notice">Phiếu đã nộp. Điểm tổ chấm và xếp loại sẽ hiển thị khi nhà trường gửi kết quả dự kiến.</div>
      )}
      {abilities.is_own && data.period.status === "disclosed" && (
        <div className="ev-notice warn">Đây là kết quả dự kiến. Nếu chưa đồng ý ở tiêu chí nào, hãy gửi giải trình ở cuối phiếu trước khi nhà trường công bố.</div>
      )}

      <div className="ev-sheet-layout">
        <div className="ev-sheet-main">
          <section className="ev-card ev-info">
            <label>
              <span className="ev-label-row">
                Nhiệm vụ được phân công trong tháng
                {selfMode && <button type="button" className="dl-link-btn" onClick={fillDuties}><ClipboardCopy size={13} /> Lấy từ Giao việc</button>}
              </span>
              {selfMode ? (
                <textarea rows={4} value={form.duties} onChange={(e) => setField("duties", e.target.value, "self")} placeholder="Liệt kê nhiệm vụ được giao trong tháng..." />
              ) : (
                <p className="ev-readonly-text">{data.duties || "—"}</p>
              )}
            </label>
            <label>
              <span className="ev-label-row">Kết quả</span>
              {selfMode ? (
                <textarea rows={3} value={form.results} onChange={(e) => setField("results", e.target.value, "self")} placeholder="Kết quả thực hiện nhiệm vụ..." />
              ) : (
                <p className="ev-readonly-text">{data.results || "—"}</p>
              )}
            </label>
          </section>

          {data.sections.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              rows={rows}
              totals={totals}
              isHomeroom={isHomeroom}
              canToggleHomeroom={selfMode || unitMode}
              onToggleHomeroom={(value) => setField("is_homeroom", value, selfMode ? "self" : "unit")}
              selfMode={selfMode}
              unitMode={unitMode}
              reviewMode={reviewMode}
              showUnit={showUnit}
              showFinal={showFinal}
              canAddEvidence={abilities.can_add_evidence}
              onCell={setCell}
              onUpload={uploadEvidence}
              onRemoveEvidence={removeEvidence}
              onOpenEvidence={openEvidence}
              onCopySelf={unitMode ? copySelfToUnit : null}
            />
          ))}

          <Comments data={data} onChanged={(detail) => setData(detail)} onError={setError} />
        </div>

        <aside className="ev-summary">
          <Summary
            data={data}
            totals={totals}
            isHomeroom={isHomeroom}
            showUnit={showUnit}
            showFinal={showFinal}
            suggested={suggested}
            resultColumn={resultColumn}
            form={form}
            reviewMode={reviewMode}
            onField={(field, value) => setField(field, value, "review")}
          />
        </aside>
      </div>

      <PrintSheet data={data} rows={rows} form={form} totals={totals} suggested={suggested} showUnit={showUnit} />

      {returning && (
        <ReturnDialog
          onClose={() => setReturning(false)}
          onSubmit={async (message) => {
            const ok = await save(() => apiJson(`/api/evaluations/${data.id}/return`, { method: "POST", body: { message } }));
            if (ok) setReturning(false);
          }}
        />
      )}
      {preview && <FilePreview files={preview.files} startIndex={preview.index} onClose={() => setPreview(null)} />}
    </div>
  );
}

function SectionCard({ section, rows, totals, isHomeroom, canToggleHomeroom, onToggleHomeroom, selfMode, unitMode, reviewMode, showUnit, showFinal, canAddEvidence, onCell, onUpload, onRemoveEvidence, onOpenEvidence, onCopySelf }) {
  const disabled = section.homeroom_only && !isHomeroom;
  const bonus = section.kind === "bonus";
  return (
    <section className={`ev-card ev-section ${disabled ? "disabled" : ""}`}>
      <header>
        <h3>
          <span>{section.code}.</span> {section.title}
        </h3>
        <small>{bonus ? `Tối đa +${formatScore(section.max_score)} điểm/tháng, cần minh chứng` : `Tối đa ${formatScore(section.max_score)} điểm`}</small>
        {section.homeroom_only && (
          <label className="ev-switch">
            <input type="checkbox" checked={isHomeroom} disabled={!canToggleHomeroom} onChange={(e) => onToggleHomeroom(e.target.checked)} />
            <span>{canToggleHomeroom && selfMode ? "Tôi là GVCN tháng này" : "Là GVCN tháng này"}</span>
          </label>
        )}
        {onCopySelf && !disabled && section.code === "I" && (
          <button type="button" className="dl-link-btn ev-copy" onClick={onCopySelf} title="Chép điểm tự chấm sang các ô tổ chấm còn trống">
            <ClipboardCopy size={13} /> Chép điểm tự chấm
          </button>
        )}
      </header>
      {disabled ? (
        <p className="ev-disabled-note">Chỉ áp dụng cho giáo viên chủ nhiệm. Bật “GVCN” ở trên nếu bạn chủ nhiệm lớp trong tháng này.</p>
      ) : (
        <div className="ev-criteria" style={{ "--score-cols": 1 + Number(showUnit) + Number(showFinal) }}>
          <div className="ev-criteria-head">
            <span>Tiêu chí</span>
            <span>Tự chấm</span>
            {showUnit && <span>Tổ chấm</span>}
            {showFinal && <span>Chốt</span>}
          </div>
          {section.criteria.map((criterion) => (
            <CriterionRow
              key={criterion.id}
              criterion={criterion}
              row={rows[criterion.id] ?? {}}
              bonus={bonus}
              selfMode={selfMode}
              unitMode={unitMode}
              reviewMode={reviewMode}
              showUnit={showUnit}
              showFinal={showFinal}
              canAddEvidence={canAddEvidence}
              onCell={onCell}
              onUpload={onUpload}
              onRemoveEvidence={onRemoveEvidence}
              onOpenEvidence={onOpenEvidence}
            />
          ))}
          <div className="ev-section-total">
            <span>{bonus ? "Tổng điểm cộng" : "Tổng mục"}</span>
            <b>{formatScore(totals.self.sections[section.id])}</b>
            {showUnit && <b>{formatScore(totals.unit?.sections[section.id])}</b>}
            {showFinal && <b>{formatScore(totals.final?.sections[section.id])}</b>}
          </div>
        </div>
      )}
    </section>
  );
}

function ScoreCell({ value, note, max, editable, onScore, onNote, placeholder, highlight, withNote = true }) {
  const parsed = parseScore(value);
  const invalid = parsed !== null && (Number.isNaN(parsed) || parsed < 0 || parsed > max);
  if (!editable) {
    return (
      <div className={`ev-cell readonly ${highlight ? "changed" : ""}`}>
        <b>{value === "" ? (placeholder ? formatScore(parseScore(placeholder)) : "—") : formatScore(parsed)}</b>
        {note && <small title={note}>{note}</small>}
      </div>
    );
  }
  return (
    <div className={`ev-cell ${highlight ? "changed" : ""}`}>
      <input
        className={invalid ? "invalid" : ""}
        inputMode="decimal"
        value={value}
        placeholder={placeholder ?? `/${formatScore(max)}`}
        onChange={(e) => onScore(e.target.value)}
        title={invalid ? `Điểm từ 0 đến ${formatScore(max)}` : undefined}
        aria-invalid={invalid}
      />
      {withNote && <input className="ev-note" value={note} onChange={(e) => onNote(e.target.value)} placeholder="Ghi chú điểm trừ" />}
    </div>
  );
}

function CriterionRow({ criterion, row, bonus, selfMode, unitMode, reviewMode, showUnit, showFinal, canAddEvidence, onCell, onUpload, onRemoveEvidence, onOpenEvidence }) {
  const [open, setOpen] = useState(false);
  const fileInput = useRef(null);
  const lines = (criterion.guidance ?? "").split("\n").filter(Boolean);
  const finalChanged = row.final_score !== "" && parseScore(row.final_score) !== parseScore(row.unit_score);
  const selfValue = parseScore(row.self_score) ?? 0;
  return (
    <div className="ev-criterion">
      <div className="ev-criterion-title">
        <b>{criterion.code}. {criterion.title}</b>
        <small>{bonus ? "Điểm cộng" : `Tối đa ${formatScore(criterion.max_score)} điểm`}</small>
        {lines.length > 0 && (
          <button type="button" className={`ev-guide-toggle ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
            Cách tính điểm <ChevronDown size={13} />
          </button>
        )}
        {open && <ul className="ev-guidance">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
        <div className="ev-evidence">
          {criterion.evidence.map((file, index) => (
            <span key={file.id} className="ev-evidence-chip">
              <button type="button" onClick={() => onOpenEvidence(criterion, index)} title={`${file.name} · ${formatBytes(file.size)}`}>
                <FileText size={12} /> {file.name}
              </button>
              {canAddEvidence && <button type="button" className="remove" onClick={() => onRemoveEvidence(file)} aria-label={`Xóa ${file.name}`}><X size={11} /></button>}
            </span>
          ))}
          {canAddEvidence && (
            <>
              <button type="button" className="ev-add-evidence" onClick={() => fileInput.current?.click()}>
                <Paperclip size={12} /> Minh chứng
              </button>
              <input ref={fileInput} type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png" onChange={(e) => { onUpload(criterion.id, e.target.files); e.target.value = ""; }} />
            </>
          )}
          {bonus && selfValue > 0 && !criterion.evidence.length && <small className="ev-late">Chưa có minh chứng</small>}
        </div>
      </div>
      <ScoreCell
        value={row.self_score ?? ""}
        note={row.self_note ?? ""}
        max={criterion.max_score}
        editable={selfMode}
        onScore={(value) => onCell(criterion.id, "self_score", value, "self")}
        onNote={(value) => onCell(criterion.id, "self_note", value, "self")}
      />
      {showUnit && (
        <ScoreCell
          value={row.unit_score ?? ""}
          note={row.unit_note ?? ""}
          max={criterion.max_score}
          editable={unitMode}
          onScore={(value) => onCell(criterion.id, "unit_score", value, "unit")}
          onNote={(value) => onCell(criterion.id, "unit_note", value, "unit")}
        />
      )}
      {showFinal && (
        <ScoreCell
          value={row.final_score ?? ""}
          max={criterion.max_score}
          editable={reviewMode}
          withNote={false}
          placeholder={row.unit_score || undefined}
          highlight={finalChanged}
          onScore={(value) => onCell(criterion.id, "final_score", value, "review")}
        />
      )}
    </div>
  );
}

function Summary({ data, totals, isHomeroom, showUnit, showFinal, suggested, resultColumn, form, reviewMode, onField }) {
  const base = maxBase(data.sections, isHomeroom);
  const columns = [["self", "Tự chấm"], ...(showUnit ? [["unit", "Tổ chấm"]] : []), ...(showFinal ? [["final", "Chốt"]] : [])];
  const chosen = data.grades.find((grade) => grade.code === form.grade);
  const gradeLabel = form.no_grade ? "Không xếp loại" : chosen?.name ?? suggested?.name ?? "Chưa đạt khung xếp loại";
  return (
    <div className="ev-card ev-summary-card">
      <h3>Tổng hợp điểm</h3>
      <table className="ev-summary-table">
        <thead>
          <tr>
            <th>Mục</th>
            {columns.map(([key, label]) => <th key={key}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.sections.filter((s) => !s.homeroom_only || isHomeroom).map((section) => (
            <tr key={section.id}>
              <td>{section.code} <small>/{formatScore(section.max_score)}</small></td>
              {columns.map(([key]) => <td key={key}>{formatScore(totals[key]?.sections[section.id])}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Cơ bản <small>/{base}</small></td>
            {columns.map(([key]) => <td key={key}>{formatScore(totals[key]?.base)}</td>)}
          </tr>
          <tr>
            <td>Điểm cộng <small>/{formatScore(data.bonus_max)}</small></td>
            {columns.map(([key]) => <td key={key}>{formatScore(totals[key]?.bonus)}</td>)}
          </tr>
          <tr className="grand">
            <td>Tổng</td>
            {columns.map(([key]) => <td key={key}>{formatScore(totals[key]?.total)}</td>)}
          </tr>
        </tfoot>
      </table>

      <div className={`ev-grade ${form.no_grade ? "none" : ""}`}>
        <small>{data.status === "published" ? "Xếp loại" : resultColumn === "self" ? "Xếp loại dự kiến (theo tự chấm)" : "Xếp loại dự kiến"}</small>
        <b>{data.status === "published" && !reviewMode ? data.grade_name ?? (data.no_grade_reason ? "Không xếp loại" : "—") : gradeLabel}</b>
        <span>Khung {isHomeroom ? "GVCN (100 điểm)" : "không chủ nhiệm (80 điểm)"}</span>
        {data.no_grade_reason && !reviewMode && <em>{data.no_grade_reason}</em>}
        {data.has_violation && !reviewMode && <em>Có vi phạm QCCM/đạo đức nhà giáo</em>}
      </div>

      {reviewMode && (
        <div className="ev-review">
          <h4>Duyệt kết quả</h4>
          <label className="ev-check">
            <input type="checkbox" checked={form.has_violation} onChange={(e) => onField("has_violation", e.target.checked)} />
            Có vi phạm QCCM / đạo đức nhà giáo
          </label>
          <label className="ev-check">
            <input type="checkbox" checked={form.no_grade} onChange={(e) => onField("no_grade", e.target.checked)} />
            Không xếp loại tháng
          </label>
          {form.no_grade && <input value={form.no_grade_reason} onChange={(e) => onField("no_grade_reason", e.target.value)} placeholder="Lý do (VD: lên lớp không có KHBD)" />}
          {!form.no_grade && (
            <label>
              Xếp loại
              <select value={form.grade} onChange={(e) => onField("grade", e.target.value)}>
                <option value="">Theo gợi ý{suggested ? ` (${suggested.name})` : ""}</option>
                {data.grades.map((grade) => <option key={grade.code} value={grade.code}>{grade.name}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <dl className="ev-trail">
        {data.submitted_at && <><dt>Nộp phiếu</dt><dd>{formatMoment(data.submitted_at)}</dd></>}
        {data.unit_scored_by && <><dt>Tổ chấm</dt><dd>{data.unit_scored_by} · {formatMoment(data.unit_scored_at)}</dd></>}
        {data.reviewed_by && <><dt>Duyệt</dt><dd>{data.reviewed_by} · {formatMoment(data.reviewed_at)}</dd></>}
      </dl>
    </div>
  );
}

function Comments({ data, onChanged, onError }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const send = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const result = await apiJson(`/api/evaluations/${data.id}/comments`, { method: "POST", body: { content: text.trim() } });
      setText("");
      onChanged(result.data);
    } catch (e) {
      onError(e.message);
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="ev-card ev-comments-card">
      <h3>Trao đổi & giải trình</h3>
      {data.comments.length === 0 && <p className="ev-muted">Chưa có trao đổi nào.</p>}
      <ul>
        {data.comments.map((comment) => (
          <li key={comment.id}>
            {comment.user.avatar_url ? <img src={comment.user.avatar_url} alt="" /> : <i>{comment.user.name.split(" ").at(-1).charAt(0)}</i>}
            <div>
              <b>{comment.user.name}</b> <small>{formatMoment(comment.created_at)}</small>
              <p>{comment.content}</p>
            </div>
          </li>
        ))}
      </ul>
      {data.abilities.can_comment && (
        <form onSubmit={send}>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={data.abilities.is_own ? "Gửi giải trình hoặc trao đổi với người chấm..." : "Trao đổi với giáo viên..."} />
          <button className="primary-btn" disabled={sending || !text.trim()}>{sending ? "Đang gửi..." : "Gửi"}</button>
        </form>
      )}
    </section>
  );
}

function ReturnDialog({ onClose, onSubmit }) {
  const [message, setMessage] = useState("");
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ev-dialog" onSubmit={(e) => { e.preventDefault(); if (message.trim()) onSubmit(message.trim()); }}>
        <h3>Trả phiếu về cho giáo viên</h3>
        <label>
          Lý do / nội dung cần bổ sung
          <textarea rows={4} autoFocus value={message} onChange={(e) => setMessage(e.target.value)} placeholder="VD: Bổ sung minh chứng cho điểm cộng mục VI.2" />
        </label>
        <p className="ev-dialog-note">Phiếu quay về trạng thái “Chưa nộp” để giáo viên sửa và nộp lại. Giáo viên nhận được thông báo kèm lý do.</p>
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose}>Hủy</button>
          <button className="primary-btn" disabled={!message.trim()}>Trả phiếu</button>
        </footer>
      </form>
    </div>
  );
}

function PrintSheet({ data, rows, form, totals, suggested, showUnit }) {
  const isHomeroom = form.is_homeroom;
  const sections = data.sections.filter((section) => !section.homeroom_only || isHomeroom);
  const value = (criterionId, column) => {
    const parsed = parseScore(rows[criterionId]?.[`${column}_score`]);
    return parsed === null ? "" : formatScore(parsed);
  };
  const grade = data.status === "published" ? data.grade_name : form.no_grade ? "Không xếp loại" : suggested?.name;
  return (
    <div className="ev-print">
      <div className="ev-print-head">
        <div>
          <b>TRƯỜNG TH & THCS THANH ĐÀM</b>
          <b>HỘI ĐỒNG THI ĐUA KHEN THƯỞNG</b>
        </div>
      </div>
      <h1>ĐÁNH GIÁ THI ĐUA</h1>
      <p className="center">Tháng {data.period.month} năm {data.period.year}</p>
      <p>Họ và tên: <b>{data.teacher.name}</b></p>
      <p>Chức vụ: {data.teacher.position}{isHomeroom ? " — Giáo viên chủ nhiệm" : ""}</p>
      <p>Nhiệm vụ được phân công trong tháng:</p>
      <p className="pre">{form.duties || data.duties || "……………………………………………"}</p>
      <p>Kết quả:</p>
      <p className="pre">{form.results || data.results || "……………………………………………"}</p>
      <h2>BẢNG TIÊU CHÍ CHẤM ĐIỂM THI ĐUA HÀNG THÁNG</h2>
      {sections.map((section) => (
        <table key={section.id}>
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "45%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead>
            <tr><th colSpan={6} className="left">{section.code}. {section.title.toUpperCase()} ({section.kind === "bonus" ? `tối đa ${formatScore(section.max_score)} điểm/tháng` : `Tối đa: ${formatScore(section.max_score)} điểm`})</th></tr>
            <tr>
              <th>STT</th>
              <th>Tiêu chuẩn đánh giá</th>
              <th>Nội dung và cách tính điểm</th>
              <th>Cá nhân tự chấm</th>
              <th>Tổ chấm</th>
              <th>Ghi chú điểm trừ</th>
            </tr>
          </thead>
          <tbody>
            {section.criteria.map((criterion) => (
              <tr key={criterion.id}>
                <td className="center">{criterion.code}</td>
                <td>{criterion.title}{section.kind !== "bonus" && <> ({formatScore(criterion.max_score)} điểm)</>}</td>
                <td className="guide">{(criterion.guidance ?? "").split("\n").filter(Boolean).map((line, index) => <div key={index}>• {line}</div>)}</td>
                <td className="center">{value(criterion.id, "self")}</td>
                <td className="center">{showUnit ? value(criterion.id, "unit") : ""}</td>
                <td>{[rows[criterion.id]?.self_note, showUnit ? rows[criterion.id]?.unit_note : ""].filter(Boolean).join("; ")}</td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={3}>TỔNG ĐIỂM</td>
              <td className="center">{formatScore(totals.self.sections[section.id])}</td>
              <td className="center">{showUnit ? formatScore(totals.unit?.sections[section.id]) : ""}</td>
              <td />
            </tr>
          </tbody>
        </table>
      ))}
      <p>
        Tổng điểm tháng: cá nhân tự chấm <b>{formatScore(totals.self.total)}</b>
        {showUnit && <> — tổ chấm <b>{formatScore(totals.unit?.total)}</b></>}
        {totals.final && <> — điểm chốt <b>{formatScore(totals.final.total)}</b></>}
      </p>
      <p>Xếp loại thi đua: <b>{grade ?? "……………"}</b></p>
      <div className="ev-print-signs">
        <div><b>HIỆU TRƯỞNG/CHỦ TỊCH HỘI ĐỒNG</b><small>(Ký, ghi rõ họ tên)</small></div>
        <div><b>TM. TỔ CHUYÊN MÔN</b><b>TỔ TRƯỞNG</b></div>
        <div><b>CÁ NHÂN TỰ ĐÁNH GIÁ</b><span>{data.teacher.name}</span></div>
      </div>
    </div>
  );
}
