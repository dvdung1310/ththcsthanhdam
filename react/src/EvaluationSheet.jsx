import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useParams } from "react-router";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  CalendarOff,
  CloudOff,
  LoaderCircle,
  Plus,
  FileText,
  ListChecks,
  Paperclip,
  Printer,
  Send,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { apiFetch, apiJson } from "./api";
import { uploadProblem } from "./uploadLimits";
import { useConfirm } from "./ConfirmDialog";
import FilePreview from "./FilePreview";
import EvaluationScorerPicker from "./EvaluationScorerPicker";
import { formatBytes } from "./fileUtils";
import { SCORE_PATTERN, STATUS_TONES, computeTotals, formatDay, formatMoment, formatScore, hasZeroCriterion, maxBase, normalizeScore, parseScore, scoreError, suggestGrade } from "./evaluationUtils";
import "./Evaluation.css";
import Avatar from "./Avatar";

const TASK_STATUS = { not_started: "Chưa thực hiện", in_progress: "Đang thực hiện", waiting_approval: "Chờ duyệt", completed: "Hoàn thành" };
const AUTOSAVE_DELAY = 1500;
const SheetContext = createContext({ scorer: "Tổ chấm", teacherSheet: true, leave: null });
const SESSION_NAMES = { am: "sáng", pm: "chiều" };
const shortDay = (value) => value.slice(8, 10) + "/" + value.slice(5, 7);
const lower = (label) => (label.startsWith("BGH") ? label : label.toLowerCase());
const CLEAN = { self: false, unit: false, review: false };
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
      };
    }),
  );
  return rows;
}

const reviewFields = (form) => ({
  has_violation: form.has_violation,
  no_grade_reason: form.no_grade ? form.no_grade_reason || "Không xếp loại tháng" : null,
  grade: form.grade || null,
});

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
  const [dirty, setDirty] = useState(CLEAN);
  const [saving, setSaving] = useState(false);
  const [autosave, setAutosave] = useState({ state: "idle", at: null, error: "" });
  const [version, setVersion] = useState(0);
  const latest = useRef({});
  const inflight = useRef(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState(null);
  const [returning, setReturning] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  const reset = useCallback((detail) => {
    setData(detail);
    setRows(buildRows(detail));
    setForm(buildForm(detail));
    setDirty(CLEAN);
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
  const editableColumns = data ? [data.abilities.can_self_score && "self", data.abilities.can_unit_score && "unit"].filter(Boolean) : [];
  const invalidList = data ? editableColumns.flatMap((column) => invalidCells(column)) : [];
  const unsaved = anyDirty || invalidList.length > 0 || autosave.state === "error";
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const abilities = data?.abilities ?? {};
  const selfMode = abilities.can_self_score;
  const unitMode = abilities.can_unit_score;
  const reviewMode = abilities.can_review;
  const showUnit = !!data && (data.show_result || unitMode);
  const isHomeroom = form?.is_homeroom ?? false;

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      self: computeTotals(data.sections, rows, "self", isHomeroom),
      unit: showUnit ? computeTotals(data.sections, rows, "unit", isHomeroom) : null,
    };
  }, [data, rows, isHomeroom, showUnit]);

  const resultColumn = showUnit ? "unit" : "self";
  const resultTotal = totals?.[resultColumn]?.total ?? 0;
  const suggested = data && !form?.no_grade ? suggestGrade(data.grades, resultTotal, isHomeroom, form?.has_violation, hasZeroCriterion(data.sections, rows, resultColumn, isHomeroom)) : null;
  const sheetContext = useMemo(() => ({ scorer: data?.scorer_label ?? "Tổ chấm", teacherSheet: (data?.audience ?? "teacher") === "teacher", leave: data?.leave ?? null }), [data]);

  const touch = (group) => {
    setDirty((current) => ({ ...current, [group]: true }));
    setVersion((current) => current + 1);
  };
  const setCell = (criterionId, field, value, group) => {
    setRows((current) => ({ ...current, [criterionId]: { ...current[criterionId], [field]: value } }));
    touch(group);
  };
  const setField = (field, value, group) => {
    setForm((current) => ({ ...current, [field]: value }));
    touch(group);
  };

  function invalidCells(column) {
    return data.sections
      .filter((section) => !section.homeroom_only || (form?.is_homeroom ?? false))
      .flatMap((section) => section.criteria.filter((criterion) => scoreError(rows[criterion.id]?.[`${column}_score`], criterion.max_score)));
  }

  const payload = (column, withNote = true, source = rows) =>
    data.sections.flatMap((section) =>
      section.criteria
        .filter((criterion) => !scoreError(source[criterion.id]?.[`${column}_score`], criterion.max_score))
        .map((criterion) => ({
          criterion_id: criterion.id,
          score: parseScore(source[criterion.id]?.[`${column}_score`]),
          ...(withNote ? { note: source[criterion.id]?.[`${column}_note`] || null } : {}),
        })),
    );

  const focusInvalid = () => {
    const input = document.querySelector(".ev-score-input.invalid input");
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    input?.focus({ preventScroll: true });
  };

  const guardInvalid = (...columns) => {
    const invalid = columns.flatMap((column) => invalidCells(column));
    if (invalid.length) {
      setError(`Còn ${invalid.length} ô điểm không hợp lệ (đầu tiên: “${invalid[0].title}”, tối đa ${formatScore(invalid[0].max_score)}). Sửa lại trước khi tiếp tục.`);
      focusInvalid();
      return true;
    }
    return false;
  };

  const draftRequest = (group, snapshot) => {
    const { rows: source, form: fields } = snapshot;
    if (group === "self") {
      return apiJson(`/api/evaluations/${data.id}/self`, {
        method: "PUT",
        body: { is_homeroom: fields.is_homeroom, duties: fields.duties, results: fields.results, scores: payload("self", true, source), submit: false },
      });
    }
    if (group === "unit") {
      return apiJson(`/api/evaluations/${data.id}/unit`, { method: "PUT", body: { is_homeroom: fields.is_homeroom, scores: payload("unit", true, source), complete: false } });
    }
    return apiJson(`/api/evaluations/${data.id}/review`, { method: "PUT", body: { ...reviewFields(fields), approve: false } });
  };

  const persist = async () => {
    if (inflight.current) await inflight.current;
    const { dirty: pending, version: startVersion } = latest.current;
    const groups = Object.keys(pending).filter((group) => pending[group]);
    if (!groups.length || !data) return true;
    const snapshot = { rows: latest.current.rows, form: latest.current.form };
    setAutosave((current) => ({ ...current, state: "saving" }));
    const job = (async () => {
      try {
        let detail = null;
        for (const group of groups) detail = (await draftRequest(group, snapshot)).data;
        setData(detail);
        if (latest.current.version === startVersion) setDirty(CLEAN);
        setAutosave({ state: "saved", at: new Date(), error: "" });
        return true;
      } catch (e) {
        setAutosave({ state: "error", at: null, error: e.message });
        return false;
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = job;
    return job;
  };

  latest.current = { ...latest.current, rows, form, dirty, version, persist, invalidCount: invalidList.length, autosaveState: autosave.state };

  useEffect(() => {
    if (!version || !anyDirty) return undefined;
    const timer = setTimeout(() => latest.current.persist(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [version, anyDirty]);

  useEffect(() => {
    const flush = () => document.visibilityState === "hidden" && latest.current.persist();
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    (async () => {
      const saved = await latest.current.persist();
      const { invalidCount } = latest.current;
      if (saved && !invalidCount) {
        blocker.proceed();
        return;
      }
      const leave = await confirm({
        tone: "danger",
        icon: TriangleAlert,
        title: "Có thay đổi chưa được lưu",
        message: invalidCount
          ? `Còn ${invalidCount} ô điểm không hợp lệ nên chưa được lưu. Nếu rời trang, các giá trị này sẽ mất; các ô hợp lệ khác đã được lưu.`
          : "Không lưu được thay đổi gần nhất (mất kết nối hoặc lỗi máy chủ). Nếu rời trang, thay đổi này sẽ mất.",
        confirmText: "Rời trang",
        cancelText: "Ở lại",
      });
      if (leave) blocker.proceed();
      else {
        blocker.reset();
        if (invalidCount) focusInvalid();
      }
    })();
  }, [blocker.state]);


  const save = async (request, message) => {
    setSaving(true);
    setError("");
    try {
      if (inflight.current) await inflight.current;
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

  const assignScorers = async (userIds) => {
    setAssignSaving(true);
    try {
      const result = await apiJson(`/api/evaluations/${data.id}/scorers`, { method: "PUT", body: { user_ids: userIds } });
      setData((current) => ({ ...current, assigned_scorers: result.data.assigned_scorers, default_scorers: result.data.default_scorers, abilities: result.data.abilities }));
      setSuccess(result.message);
      setAssigning(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setAssignSaving(false);
    }
  };

  const saveSelf = async (submit = false) => {
    if (guardInvalid("self")) return;
    if (submit) {
      const unexplained = deductedWithoutNote("self");
      const empty = data.sections
        .filter((s) => s.kind !== "bonus" && (!s.homeroom_only || isHomeroom))
        .flatMap((s) => s.criteria)
        .filter((c) => parseScore(rows[c.id]?.self_score) === null);
      const noEvidence = data.sections
        .filter((s) => !s.homeroom_only || isHomeroom)
        .flatMap((s) => s.criteria)
        .filter((c) => c.requires_evidence && (parseScore(rows[c.id]?.self_score) ?? 0) > 0 && !c.evidence.length);
      const warnings = [
        empty.length ? `${empty.length} tiêu chí chưa chấm (tính là 0 điểm).` : null,
        noEvidence.length ? `${noEvidence.length} tiêu chí cần minh chứng nhưng chưa có minh chứng.` : null,
        unexplained.length ? `${unexplained.length} tiêu chí bị trừ điểm nhưng chưa ghi lý do.` : null,
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

  const completeUnit = async () => {
    if (guardInvalid("unit")) return;
    const empty = data.sections
      .filter((s) => !s.homeroom_only || isHomeroom)
      .filter((s) => s.kind !== "bonus")
      .flatMap((s) => s.criteria)
      .filter((c) => parseScore(rows[c.id]?.unit_score) === null);
    const unexplained = deductedWithoutNote("unit");
    if (empty.length || unexplained.length) {
      const ok = await confirm({
        tone: empty.length ? "danger" : undefined,
        title: "Hoàn tất chấm phiếu?",
        message: [
          empty.length ? `${empty.length} tiêu chí chưa có điểm ${lower(sheetContext.scorer)} và sẽ tính là 0.` : null,
          unexplained.length ? `${unexplained.length} tiêu chí bị trừ điểm nhưng chưa ghi lý do.` : null,
        ].filter(Boolean).join(" "),
        confirmText: "Hoàn tất",
      });
      if (!ok) return;
    }
    await save(() => apiJson(`/api/evaluations/${data.id}/unit`, { method: "PUT", body: { is_homeroom: form.is_homeroom, scores: payload("unit"), complete: true } }), "Đã hoàn tất chấm phiếu.");
  };

  const approve = async () => {
    if (unitMode && guardInvalid("unit")) return;
    await save(async () => {
      if (unitMode && dirty.unit) await apiJson(`/api/evaluations/${data.id}/unit`, { method: "PUT", body: { is_homeroom: form.is_homeroom, scores: payload("unit"), complete: false } });
      return apiJson(`/api/evaluations/${data.id}/review`, { method: "PUT", body: { ...reviewFields(form), approve: true } });
    });
  };

  function deductedWithoutNote(column) {
    return data.sections
      .filter((s) => s.kind !== "bonus" && (!s.homeroom_only || isHomeroom))
      .flatMap((s) => s.criteria)
      .filter((c) => {
        const value = parseScore(rows[c.id]?.[`${column}_score`]);
        return value !== null && value < c.max_score && !rows[c.id]?.[`${column}_note`]?.trim();
      });
  }

  const copySelfToUnit = () => {
    setRows((current) => {
      const next = { ...current };
      Object.keys(next).forEach((id) => {
        if (next[id].unit_score === "" && next[id].self_score !== "") next[id] = { ...next[id], unit_score: next[id].self_score };
      });
      return next;
    });
    touch("unit");
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
    const problem = await uploadProblem(files);
    if (problem) {
      setError(problem);
      return;
    }
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
    <SheetContext.Provider value={sheetContext}>
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
            {data.teacher.avatar_url ? <img src={data.teacher.avatar_url} alt="" /> : <Avatar name={data.teacher.name} />}
            <span>
              <b>{data.teacher.name}</b>
              <small>{[data.teacher.position, data.teacher.units.join(", ")].filter(Boolean).join(" · ")}</small>
            </span>
          </span>
          <div className="ev-sheet-meta">
            <h2>Đánh giá thi đua {data.period.label}</h2>
            {data.audience_label && data.audience !== "teacher" && <span className="ev-chip purple">Phiếu {data.audience === "staff" ? "nhân viên" : data.audience_label}</span>}
            <span className={`ev-chip ${STATUS_TONES[data.status]}`}>{data.status_label}</span>
            {data.period.self_due_on && <small>Hạn tự chấm {formatDay(data.period.self_due_on)}</small>}
          </div>
        </div>
        <div className="ev-sheet-actions">
          <button className="secondary-btn" onClick={() => window.print()}><Printer size={15} /> In phiếu</button>
          {editableColumns.length > 0 && <SaveStatus autosave={autosave} dirty={anyDirty} invalid={invalidList.length} onRetry={() => latest.current.persist()} onFocusInvalid={focusInvalid} />}
          {selfMode && <button className="primary-btn" disabled={saving} onClick={() => saveSelf(true)}><Send size={15} /> Nộp phiếu</button>}
          {unitMode && abilities.can_return && <button className="secondary-btn" disabled={saving} onClick={() => setReturning(true)}><Undo2 size={15} /> Trả phiếu</button>}
          {unitMode && data.status !== "unit_scored" && (
            <button className="primary-btn" disabled={saving} onClick={completeUnit}><CheckCircle2 size={15} /> Hoàn tất chấm</button>
          )}
          {reviewMode && !(unitMode && !["unit_scored", "published"].includes(data.status)) && (
            <button
              className="primary-btn"
              disabled={saving || !["unit_scored", "published"].includes(data.status)}
              title={["unit_scored", "published"].includes(data.status) ? undefined : `Cần hoàn tất ${lower(sheetContext.scorer)} trước khi duyệt`}
              onClick={approve}
            ><CheckCircle2 size={15} /> {data.reviewed_at ? "Duyệt lại" : "Duyệt phiếu"}</button>
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
        <div className="ev-notice">Phiếu đã nộp. Điểm {lower(sheetContext.scorer)} và xếp loại sẽ hiển thị khi nhà trường gửi kết quả dự kiến.</div>
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
           
            suggested={suggested}
            resultColumn={resultColumn}
            form={form}
            reviewMode={reviewMode}
            onField={(field, value) => setField(field, value, "review")}
            onAssign={() => setAssigning(true)}
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
      {assigning && (
        <EvaluationScorerPicker
          title={`Người chấm cột “${sheetContext.scorer}”`}
          subject={`Phiếu của ${data.teacher.name} · ${data.period.label}`}
          candidates={data.scorer_candidates ?? []}
          selected={(data.assigned_scorers ?? []).map((user) => user.id)}
          defaultScorers={data.default_scorers}
          saving={assignSaving}
          onSave={assignScorers}
          onClose={() => setAssigning(false)}
        />
      )}
    </div>
    </SheetContext.Provider>
  );
}

function SectionCard({ section, rows, totals, isHomeroom, canToggleHomeroom, onToggleHomeroom, selfMode, unitMode, reviewMode, showUnit, canAddEvidence, onCell, onUpload, onRemoveEvidence, onOpenEvidence, onCopySelf }) {
  const { scorer } = useContext(SheetContext);
  const disabled = section.homeroom_only && !isHomeroom;
  const bonus = section.kind === "bonus";
  return (
    <section className={`ev-card ev-section ${disabled ? "disabled" : ""}`}>
      <header>
        <h3>
          <span>{section.code}.</span> {section.title}
        </h3>
        <small>
          {bonus ? `Tối đa +${formatScore(section.max_score)} điểm/tháng` : `Tối đa ${formatScore(section.max_score)} điểm`}
          {section.criteria.length > 0 && section.criteria.every((c) => c.requires_evidence) ? ", cần minh chứng" : ""}
        </small>
        {section.homeroom_only && (
          <label className="ev-switch">
            <input type="checkbox" checked={isHomeroom} disabled={!canToggleHomeroom} onChange={(e) => onToggleHomeroom(e.target.checked)} />
            <span>{canToggleHomeroom && selfMode ? "Tôi là GVCN tháng này" : "Là GVCN tháng này"}</span>
          </label>
        )}
        {onCopySelf && !disabled && section.code === "I" && (
          <button type="button" className="dl-link-btn ev-copy" onClick={onCopySelf} title={`Chép điểm tự chấm sang các ô ${lower(scorer)} còn trống`}>
            <ClipboardCopy size={13} /> Chép điểm tự chấm
          </button>
        )}
      </header>
      {disabled ? (
        <p className="ev-disabled-note">Chỉ áp dụng cho giáo viên chủ nhiệm. Bật “GVCN” ở trên nếu bạn chủ nhiệm lớp trong tháng này.</p>
      ) : (
        <div className="ev-criteria" style={{ "--score-cols": 1 + Number(showUnit) }}>
          <div className="ev-criteria-head">
            <span>Tiêu chí</span>
            <span>Tự chấm</span>
            {showUnit && <span>{scorer}</span>}
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
             
              canAddEvidence={canAddEvidence}
              onCell={onCell}
              onUpload={onUpload}
              onRemoveEvidence={onRemoveEvidence}
              onOpenEvidence={onOpenEvidence}
            />
          ))}
          <div className="ev-section-total">
            <span>{bonus ? "Tổng điểm cộng" : "Tổng mục"}</span>
            <SectionTotal totals={totals.self} id={section.id} />
            {showUnit && <SectionTotal totals={totals.unit} id={section.id} />}
          </div>
        </div>
      )}
    </section>
  );
}

function SaveStatus({ autosave, dirty, invalid, onRetry, onFocusInvalid }) {
  if (invalid) {
    return (
      <button type="button" className="ev-save-status warn" onClick={onFocusInvalid}>
        <TriangleAlert size={14} /> {invalid} ô chưa hợp lệ, chưa lưu
      </button>
    );
  }
  if (autosave.state === "error") {
    return (
      <button type="button" className="ev-save-status error" onClick={onRetry} title={autosave.error}>
        <CloudOff size={14} /> Lưu thất bại · Thử lại
      </button>
    );
  }
  if (autosave.state === "saving" || dirty) {
    return <span className="ev-save-status"><LoaderCircle size={14} className="spin" /> Đang lưu...</span>;
  }
  if (autosave.state === "saved") {
    return <span className="ev-save-status ok"><Check size={14} /> Đã lưu lúc {autosave.at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>;
  }
  return <span className="ev-save-status muted">Tự động lưu khi nhập</span>;
}

function SectionTotal({ totals, id }) {
  if (totals?.invalid.includes(id)) {
    return <b className="ev-total-invalid" title="Có ô điểm không hợp lệ, chưa được tính"><TriangleAlert size={13} /> {formatScore(totals.sections[id])}</b>;
  }
  return <b>{formatScore(totals?.sections[id])}</b>;
}

function ScoreCell({ value, max, editable, onScore }) {
  const [hint, setHint] = useState("");
  useEffect(() => {
    if (!hint) return undefined;
    const timer = setTimeout(() => setHint(""), 2500);
    return () => clearTimeout(timer);
  }, [hint]);
  const parsed = parseScore(value);
  if (!editable) {
    return (
      <div className="ev-cell readonly">
        <b>{value === "" ? "—" : formatScore(parsed)}</b>
      </div>
    );
  }
  const error = scoreError(value, max);
  const message = error ?? hint;
  return (
    <div className="ev-cell">
      <div className={`ev-score-input ${error ? "invalid" : ""}`}>
        <input
          inputMode="decimal"
          value={value}
          placeholder="—"
          onChange={(e) => {
            const next = e.target.value.trim();
            if (SCORE_PATTERN.test(next)) {
              setHint("");
              onScore(next);
            } else {
              setHint("Chỉ nhập số, số lẻ dùng dấu phẩy (VD 7,5)");
            }
          }}
          onBlur={() => value !== normalizeScore(value) && onScore(normalizeScore(value))}
          aria-invalid={!!error}
          aria-label={`Điểm, tối đa ${formatScore(max)}`}
        />
        <span>/{formatScore(max)}</span>
      </div>
      {message && <small className={error ? "ev-cell-error" : "ev-cell-hint"}>{message}</small>}
    </div>
  );
}

function NoteField({ label, value, editable, placeholder, onChange, autoFocus }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [value]);
  return (
    <label className="ev-note-field">
      {label && <span>{label}</span>}
      {editable ? (
        <textarea ref={ref} rows={1} value={value} autoFocus={autoFocus} maxLength={1000} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <p>{value}</p>
      )}
    </label>
  );
}

function CriterionRow({ criterion, row, bonus, selfMode, unitMode, reviewMode, showUnit, canAddEvidence, onCell, onUpload, onRemoveEvidence, onOpenEvidence }) {
  const { scorer, leave } = useContext(SheetContext);
  const [open, setOpen] = useState(false);
  const fileInput = useRef(null);
  const lines = (criterion.guidance ?? "").split("\n").filter(Boolean);
  const selfValue = parseScore(row.self_score) ?? 0;
  const [opened, setOpened] = useState({});
  const needsNote = (score) => {
    const value = parseScore(score);
    return value !== null && !Number.isNaN(value) && (bonus ? value > 0 : value < criterion.max_score);
  };
  const columns = [
    { column: "self", label: "Cá nhân", editable: selfMode, value: row.self_note ?? "", score: row.self_score },
    ...(showUnit ? [{ column: "unit", label: scorer, editable: unitMode, value: row.unit_note ?? "", score: row.unit_score }] : []),
  ];
  const notes = columns
    .map((note) => ({ ...note, opened: !!opened[note.column], visible: !!note.value.trim() || (note.editable && (needsNote(note.score) || opened[note.column])) }))
    .filter((note) => note.visible || note.editable);
  const labelled = showUnit;
  return (
    <div className="ev-criterion">
      <div className="ev-criterion-title">
        <b>{criterion.code}. {criterion.title}</b>
        <small>{bonus ? "Điểm cộng" : `Tối đa ${formatScore(criterion.max_score)} điểm`}</small>
        {(lines.length > 0 || notes.some((note) => !note.visible)) && (
          <div className="ev-note-actions">
            {lines.length > 0 && (
              <button type="button" className={`ev-guide-toggle ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
                Cách tính điểm <ChevronDown size={13} />
              </button>
            )}
            {notes.filter((note) => !note.visible).map((note) => (
              <button key={note.column} type="button" className="ev-add-note" onClick={() => setOpened((current) => ({ ...current, [note.column]: true }))}>
                <Plus size={12} /> {labelled ? `Ghi chú ${lower(note.label)}` : "Ghi chú"}
              </button>
            ))}
          </div>
        )}
        {open && <ul className="ev-guidance">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
        {criterion.tracks_leave && leave && <LeaveHint leave={leave} max={criterion.max_score} />}
        {criterion.requires_evidence && (
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
            {selfValue > 0 && !criterion.evidence.length && <small className="ev-late">Chưa có minh chứng</small>}
          </div>
        )}
      </div>
      <ScoreCell
        value={row.self_score ?? ""}
        max={criterion.max_score}
        editable={selfMode}
        onScore={(value) => onCell(criterion.id, "self_score", value, "self")}
      />
      {showUnit && (
        <ScoreCell
          value={row.unit_score ?? ""}
          max={criterion.max_score}
          editable={unitMode}
          onScore={(value) => onCell(criterion.id, "unit_score", value, "unit")}
        />
      )}
      {notes.some((note) => note.visible) && (
        <div className="ev-notes">
          {notes.filter((note) => note.visible).map((note) => (
            <NoteField
              key={note.column}
              label={labelled ? note.label : null}
              value={note.value}
              editable={note.editable}
              autoFocus={note.opened}
              placeholder={bonus ? "Nội dung, số lần, minh chứng..." : "Lý do trừ điểm (VD: đi muộn họp hội đồng ngày 3/10)"}
              onChange={(value) => onCell(criterion.id, `${note.column}_note`, value, note.column)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Summary({ data, totals, isHomeroom, showUnit, suggested, resultColumn, form, reviewMode, onField, onAssign }) {
  const { scorer, teacherSheet } = useContext(SheetContext);
  const base = maxBase(data.sections, isHomeroom);
  const columns = [["self", "Tự chấm"], ...(showUnit ? [["unit", scorer]] : [])];
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
              {columns.map(([key]) => (
                <td key={key} className={totals[key]?.invalid.includes(section.id) ? "invalid" : ""} title={totals[key]?.invalid.includes(section.id) ? "Có ô điểm không hợp lệ, chưa được tính" : undefined}>
                  {formatScore(totals[key]?.sections[section.id])}
                </td>
              ))}
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
            {columns.map(([key]) => <td key={key} className={totals[key]?.invalid.length ? "invalid" : ""}>{formatScore(totals[key]?.total)}</td>)}
          </tr>
        </tfoot>
      </table>
      {columns.some(([key]) => totals[key]?.invalid.length) && (
        <p className="ev-summary-warn"><TriangleAlert size={13} /> Có ô điểm không hợp lệ, tổng điểm chưa tính các ô này.</p>
      )}

      <div className={`ev-grade ${form.no_grade ? "none" : ""}`}>
        <small>{data.status === "published" ? "Xếp loại" : resultColumn === "self" ? "Xếp loại dự kiến (theo tự chấm)" : "Xếp loại dự kiến"}</small>
        <b>{data.status === "published" && !reviewMode ? data.grade_name ?? (data.no_grade_reason ? "Không xếp loại" : "—") : gradeLabel}</b>
        <span>{teacherSheet ? `Khung ${isHomeroom ? "GVCN" : "không chủ nhiệm"} (${base} điểm)` : `Khung ${base} điểm cơ bản`}</span>
        {data.no_grade_reason && !reviewMode && <em>{data.no_grade_reason}</em>}
        {data.has_violation && !reviewMode && <em>{teacherSheet ? "Có vi phạm QCCM/đạo đức nhà giáo" : "Có vi phạm đã được cấp có thẩm quyền kết luận"}</em>}
      </div>

      {reviewMode && (
        <div className="ev-review">
          <h4>Duyệt kết quả</h4>
          <label className="ev-check">
            <input type="checkbox" checked={form.has_violation} onChange={(e) => onField("has_violation", e.target.checked)} />
            {teacherSheet ? "Có vi phạm QCCM / đạo đức nhà giáo" : "Có vi phạm đã được cấp có thẩm quyền kết luận"}
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
        {!data.abilities.is_own && (
          <>
            <dt>Người chấm</dt>
            <dd className="ev-assign-line">
              {data.assigned_scorers?.length ? (
                <>
                  <span>{data.assigned_scorers.map((user) => user.name).join(", ")}</span>
                  <span className="ev-chip purple">Chỉ định riêng</span>
                </>
              ) : (
                <span>{data.default_scorers?.length ? data.default_scorers.join(", ") : "Chưa có"} <small className="ev-muted">(mặc định)</small></span>
              )}
              {data.abilities.can_assign_scorers && (
                <button type="button" className="ev-assign-btn" onClick={onAssign}>Đổi</button>
              )}
            </dd>
          </>
        )}
        {data.submitted_at && <><dt>Nộp phiếu</dt><dd>{formatMoment(data.submitted_at)}</dd></>}
        {data.unit_scored_by && <><dt>{scorer}</dt><dd>{data.unit_scored_by} · {formatMoment(data.unit_scored_at)}</dd></>}
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
            {comment.user.avatar_url ? <img src={comment.user.avatar_url} alt="" /> : <Avatar name={comment.user.name} />}
            <div>
              <b>{comment.user.name}</b> <small>{formatMoment(comment.created_at)}</small>
              <p>{comment.content}</p>
            </div>
          </li>
        ))}
      </ul>
      {data.abilities.can_comment && (
        <form onSubmit={send}>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={data.abilities.is_own ? "Gửi giải trình hoặc trao đổi với người chấm..." : `Trao đổi với ${data.teacher.name}...`} />
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
        <h3>Trả phiếu về cho người tự đánh giá</h3>
        <label>
          Lý do / nội dung cần bổ sung
          <textarea rows={4} autoFocus value={message} onChange={(e) => setMessage(e.target.value)} placeholder="VD: Bổ sung minh chứng cho điểm cộng mục VI.2" />
        </label>
        <p className="ev-dialog-note">Phiếu quay về trạng thái “Chưa nộp” để người được đánh giá sửa và nộp lại, kèm thông báo lý do.</p>
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose}>Hủy</button>
          <button className="primary-btn" disabled={!message.trim()}>Trả phiếu</button>
        </footer>
      </form>
    </div>
  );
}

function LeaveHint({ leave, max }) {
  const total = Math.min(leave.suggested_deduction, max);
  const empty = !leave.records.length;
  return (
    <div className={`ev-leave-hint ${empty ? "empty" : ""}`}>
      <b><CalendarOff size={13} /> Theo dõi nghỉ tháng này</b>
      {empty ? (
        <small>Chưa có ngày nghỉ nào được ghi nhận.</small>
      ) : (
        <>
          <ul>
            {leave.records.map((record) => (
              <li key={record.id}>
                <span className={`ev-leave-type ${record.type}`}>{record.type_label}{record.regime_kind ? ` · ${record.regime_kind}` : ""}</span>
                {record.starts_on === record.ends_on ? `${record.start_session === record.end_session ? `${SESSION_NAMES[record.start_session]} ` : ""}${shortDay(record.starts_on)}` : `${SESSION_NAMES[record.start_session]} ${shortDay(record.starts_on)} → ${SESSION_NAMES[record.end_session]} ${shortDay(record.ends_on)}`}
                <em>{record.sessions} buổi</em>
              </li>
            ))}
          </ul>
          <p>
            {leave.details.length ? (
              <>Gợi ý trừ <b>{formatScore(total)}đ</b>: {leave.details.map((d) => d.label).join(" + ")}{leave.suggested_deduction > max ? ` (tối đa ${formatScore(max)}đ)` : ""}.</>
            ) : (
              <>Nghỉ chế độ không trừ điểm.</>
            )}
          </p>
        </>
      )}
      {leave.year.warnings.map((warning) => <p key={warning} className="warn"><TriangleAlert size={12} /> {warning}</p>)}
      <small>Năm học {leave.year.label}: đã nghỉ {formatScore(leave.year.days)} ngày ({leave.year.sessions} buổi, không tính nghỉ chế độ). Chỉ là gợi ý, điểm vẫn do người chấm quyết định.</small>
    </div>
  );
}

function noteHeader(section) {
  const flagged = section.criteria.filter((criterion) => criterion.requires_evidence).length;
  if (!flagged) return "Ghi chú điểm trừ";
  return flagged === section.criteria.length ? "Minh chứng" : "Ghi chú / minh chứng";
}

function PrintSheet({ data, rows, form, totals, suggested, showUnit }) {
  const { scorer, teacherSheet } = useContext(SheetContext);
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
              <th>{scorer}</th>
              <th>{noteHeader(section)}</th>
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
                <td>
                  {[rows[criterion.id]?.self_note, showUnit ? rows[criterion.id]?.unit_note : ""].filter(Boolean).join("; ")}
                  {criterion.evidence.length > 0 && <div className="files">{criterion.evidence.map((file) => file.name).join("; ")}</div>}
                </td>
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
        {showUnit && <> — {lower(scorer)} <b>{formatScore(totals.unit?.total)}</b></>}
      </p>
      <p>Xếp loại thi đua: <b>{grade ?? "……………"}</b></p>
      <div className="ev-print-signs">
        <div><b>HIỆU TRƯỞNG/CHỦ TỊCH HỘI ĐỒNG</b><small>(Ký, ghi rõ họ tên)</small></div>
        {teacherSheet && <div><b>TM. TỔ CHUYÊN MÔN</b><b>TỔ TRƯỞNG</b></div>}
        <div><b>CÁ NHÂN TỰ ĐÁNH GIÁ</b><span>{data.teacher.name}</span></div>
      </div>
    </div>
  );
}
