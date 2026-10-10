import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  FileSearch,
  FileText,
  FolderOpen,
  LoaderCircle,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { apiFetch, apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import Dropdown from "./Dropdown";
import FilePreview from "./FilePreview";
import ActionMenu from "./ActionMenu";
import { CompactAssignees, ReviewerPicker, RichTextEditor } from "./TaskManagement";
import { SharedFilePicker } from "./TaskDocuments";
import { formatBytes } from "./fileUtils";
import "./TaskAiWorkspace.css";

const PRIORITIES = [
  ["low", "Thấp"],
  ["normal", "Bình thường"],
  ["high", "Cao"],
  ["urgent", "Khẩn cấp"],
];
const ACCEPT = ".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp";
const PROGRESS = ["Đang đọc tài liệu…", "Đang xác định các đầu việc…", "Đang gợi ý người thực hiện và thời hạn…", "Sắp xong…"];
const SAVE_DELAY = 800;
const MAX_DOCUMENTS = 5;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

const fromNow = (value) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
};
const shortDate = (value) => (value ? value.slice(0, 10).split("-").reverse().join("/") : "");

export default function TaskAiWorkspace() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const [refs, setRefs] = useState(null);
  const [batches, setBatches] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const [reference, drafts] = await Promise.all([apiJson("/api/tasks-reference-data"), apiJson("/api/task-drafts")]);
      setRefs(reference);
      setBatches(drafts.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const active = batches?.find((batch) => batch.id === activeId) ?? null;
  const updateBatch = (id, change) => setBatches((current) => current.map((batch) => (batch.id === id ? change(batch) : batch)));
  const dropBatch = (id) => {
    setBatches((current) => current.filter((batch) => batch.id !== id));
    setActiveId(null);
  };

  return (
    <div className="ai-page">
      {success && (
        <div className="success-toast" role="status">
          <span><CheckCircle2 size={20} /></span>
          <div><b>Thành công</b><small>{success}</small></div>
          <button onClick={() => setSuccess("")} aria-label="Đóng"><X size={17} /></button>
        </div>
      )}
      <header className="ai-head">
        {active ? (
          <button type="button" className="ai-back" onClick={() => setActiveId(null)}><ArrowLeft size={16} /> Tài liệu</button>
        ) : (
          <Link className="ai-back" to="/tasks"><ArrowLeft size={16} /> Công việc</Link>
        )}
        <div>
          <h2><Sparkles size={20} /> {active ? active.analysis?.title || active.document_name : "Tạo công việc từ tài liệu"}</h2>
          <p>{active ? "Rà soát, chỉnh sửa các bản nháp rồi bấm tạo. Bản nháp tự lưu và chỉ bạn nhìn thấy." : "AI đọc công văn, kế hoạch hay yêu cầu báo cáo và gợi ý các công việc cần giao — bạn rà soát trước khi tạo."}</p>
        </div>
      </header>
      {error && (
        <div className="api-error"><TriangleAlert size={16} />{error}<button onClick={() => setError("")}>Đóng</button></div>
      )}
      {!refs || !batches ? (
        <div className="empty-state"><LoaderCircle className="spin" size={30} /><b>Đang tải...</b></div>
      ) : active ? (
        <BatchView
          key={active.id}
          batch={active}
          refs={refs}
          confirm={confirm}
          onChange={(change) => updateBatch(active.id, change)}
          onDeleted={() => dropBatch(active.id)}
          onError={setError}
          onSuccess={setSuccess}
          onOpenForm={(draft) => navigate("/tasks", { state: { draftForm: { ...draft.payload, draft_id: draft.id } } })}
        />
      ) : (
        <StartView
          refs={refs}
          batches={batches}
          initialNodeId={location.state?.nodeId ?? null}
          onAnalyzed={(batch, message) => {
            setBatches((current) => [batch, ...current]);
            setActiveId(batch.id);
            setSuccess(message);
          }}
          onOpen={setActiveId}
          onError={setError}
          onDeleteBatch={async (batch) => {
            const ok = await confirm({ tone: "danger", title: "Xóa các bản nháp của tài liệu này?", message: `${batch.document_name} · ${batch.drafts.length} bản nháp`, confirmText: "Xóa" });
            if (!ok) return;
            try {
              const result = await apiJson(`/api/task-draft-batches/${batch.id}`, { method: "DELETE" });
              dropBatch(batch.id);
              setSuccess(result.message);
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      )}
    </div>
  );
}

function StartView({ refs, batches, initialNodeId, onAnalyzed, onOpen, onError, onDeleteBatch }) {
  const [sources, setSources] = useState(() => {
    const node = initialNodeId && refs.library_files.find((file) => file.id === initialNodeId);
    return node ? [{ key: `n${node.id}`, kind: "library", node }] : [];
  });
  const [picking, setPicking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [warning, setWarning] = useState("");
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!running) return undefined;
    setStep(0);
    const timer = setInterval(() => setStep((current) => Math.min(current + 1, PROGRESS.length - 1)), 15000);
    return () => clearInterval(timer);
  }, [running]);

  const nameOf = (item) => (item.kind === "library" ? item.node.name : item.file.name);
  const sizeOf = (item) => (item.kind === "library" ? item.node.size : item.file.size) || 0;
  const totalSize = sources.reduce((sum, item) => sum + sizeOf(item), 0);
  const addItems = (items) => {
    setWarning("");
    setSources((current) => {
      const merged = [...current];
      for (const item of items) {
        if (merged.some((existing) => existing.key === item.key)) continue;
        if (merged.length >= MAX_DOCUMENTS) {
          setWarning(`Mỗi lần phân tích tối đa ${MAX_DOCUMENTS} tài liệu.`);
          break;
        }
        merged.push(item);
      }
      return merged;
    });
  };
  const addFiles = (fileList) => addItems([...fileList].map((file) => ({ key: `u${file.name}-${file.size}-${file.lastModified}`, kind: "upload", file })));
  const toggleNode = (id) => {
    const key = `n${id}`;
    if (sources.some((item) => item.key === key)) setSources((current) => current.filter((item) => item.key !== key));
    else addItems([{ key, kind: "library", node: refs.library_files.find((file) => file.id === id) }]);
  };
  const remove = (key) => {
    setWarning("");
    setSources((current) => current.filter((item) => item.key !== key));
  };

  const analyze = async () => {
    if (totalSize > MAX_TOTAL_BYTES) {
      setWarning("Tổng dung lượng các tài liệu tối đa 30MB.");
      return;
    }
    const body = new FormData();
    sources.forEach((item) => (item.kind === "library" ? body.append("node_ids[]", item.node.id) : body.append("files[]", item.file)));
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    try {
      const response = await apiFetch("/api/task-drafts/analyze", { method: "POST", headers: { Accept: "application/json" }, body, signal: controller.signal, silent: true });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Object.values(result.errors ?? {}).flat()[0] ?? result.message ?? "Không phân tích được tài liệu.");
      onAnalyzed(result.data, result.message);
      setSources([]);
    } catch (e) {
      if (e.name !== "AbortError") onError(e.message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="ai-start">
      <section className={`ai-card ai-source ${dragging ? "dragging" : ""} ${sources.length && !running ? "filled" : ""}`}
        onDragOver={(event) => { event.preventDefault(); if (!running) setDragging(true); }}
        onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget) && setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (!running) addFiles(event.dataTransfer.files); }}
      >
        {running ? (
          <div className="ai-running">
            <span className="ai-orb"><Sparkles size={26} /></span>
            <b>{PROGRESS[step]}</b>
            <small>{sources.length > 1 ? `${sources.length} tài liệu · thường mất 1–2 phút` : "Thường mất 20–60 giây"}</small>
            <ul className="ai-running-files">{sources.map((item) => <li key={item.key}><FileText size={13} /> {nameOf(item)}</li>)}</ul>
            <div className="ai-bar"><i style={{ width: `${((step + 1) / PROGRESS.length) * 100}%` }} /></div>
            <button type="button" className="secondary-btn" onClick={() => abortRef.current?.abort()}>Hủy</button>
          </div>
        ) : sources.length ? (
          <div className="ai-picked-list">
            <header>
              <b>{sources.length} tài liệu sẽ được phân tích cùng nhau</b>
              <small>Ví dụ: công văn kèm phụ lục, mẫu biểu, kế hoạch · tối đa {MAX_DOCUMENTS} file, tổng 30MB</small>
            </header>
            <ul>
              {sources.map((item, index) => (
                <li key={item.key}>
                  <span className="ai-index">{index + 1}</span>
                  <span className="ai-file-icon small"><FileText size={16} /></span>
                  <span className="ai-picked-name">
                    <b title={nameOf(item)}>{nameOf(item)}</b>
                    <small>{item.kind === "library" ? "Chia sẻ chung" : "Tải lên từ máy"} · {formatBytes(sizeOf(item))}</small>
                  </span>
                  <button type="button" className="ai-icon-btn" onClick={() => remove(item.key)} aria-label={`Bỏ ${nameOf(item)}`}><X size={15} /></button>
                </li>
              ))}
            </ul>
            <div className="ai-picked-actions">
              {sources.length < MAX_DOCUMENTS && (
                <>
                  <button type="button" className="secondary-btn" onClick={() => setPicking(true)}><FolderOpen size={15} /> Thêm từ Chia sẻ chung</button>
                  <button type="button" className="secondary-btn" onClick={() => inputRef.current?.click()}><Upload size={15} /> Tải thêm file</button>
                </>
              )}
              <span className="ai-toolbar-gap" />
              <button type="button" className="primary-btn" onClick={analyze}><Sparkles size={16} /> Phân tích {sources.length > 1 ? `${sources.length} tài liệu` : "bằng AI"}</button>
            </div>
          </div>
        ) : (
          <div className="ai-empty-source">
            <span className="ai-orb"><FileSearch size={26} /></span>
            <b>Chọn công văn, kế hoạch hoặc yêu cầu báo cáo</b>
            <small>Chọn được tối đa {MAX_DOCUMENTS} tài liệu liên quan (công văn kèm phụ lục, mẫu biểu…) · PDF, Word (.docx), ảnh chụp · hoặc kéo thả vào đây</small>
            <div className="ai-source-actions">
              <button type="button" className="secondary-btn" onClick={() => setPicking(true)}><FolderOpen size={16} /> Chọn từ Chia sẻ chung</button>
              <button type="button" className="secondary-btn" onClick={() => inputRef.current?.click()}><Upload size={16} /> Tải file lên</button>
            </div>
          </div>
        )}
        {warning && !running && <p className="ai-warning"><TriangleAlert size={13} /> {warning}</p>}
        <input ref={inputRef} type="file" hidden multiple accept={ACCEPT} onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
      </section>

      <section className="ai-card ai-history">
        <header>
          <b>Tài liệu đã phân tích</b>
          <small>{batches.some((batch) => batch.drafts.length) ? "Bấm để tiếp tục rà soát các bản nháp" : "Chưa có bản nháp nào đang chờ"}</small>
        </header>
        {batches.filter((batch) => batch.drafts.length).map((batch) => (
          <div key={batch.id} className="ai-history-row">
            <button type="button" onClick={() => onOpen(batch.id)}>
              <span className="ai-file-icon small"><FileText size={16} /></span>
              <span>
                <b>{batch.analysis?.number ? `${batch.analysis.number} · ` : ""}{batch.analysis?.title || batch.document_name}</b>
                <small>{batch.sources.length > 1 ? `${batch.sources.length} tài liệu · ` : ""}{batch.drafts.length} bản nháp · {fromNow(batch.updated_at)}</small>
              </span>
            </button>
            <button type="button" className="ai-icon-btn danger" onClick={() => onDeleteBatch(batch)} aria-label="Xóa"><Trash2 size={15} /></button>
          </div>
        ))}
      </section>

      {picking && (
        <SharedFilePicker
          files={refs.library_files}
          selected={sources.filter((item) => item.kind === "library").map((item) => item.node.id)}
          onToggle={toggleNode}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function BatchView({ batch, refs, confirm, onChange, onDeleted, onError, onSuccess, onOpenForm }) {
  const [selected, setSelected] = useState(() => new Set(batch.drafts.map((draft) => draft.id)));
  const [states, setStates] = useState({});
  const [created, setCreated] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState(null);
  const timers = useRef({});
  const pending = useRef({});

  const setState = (id, value) => setStates((current) => ({ ...current, [id]: { ...current[id], ...value } }));
  const persist = useCallback(async (id) => {
    const payload = pending.current[id];
    delete pending.current[id];
    clearTimeout(timers.current[id]);
    if (!payload) return;
    setState(id, { saving: true });
    try {
      await apiJson(`/api/task-drafts/${id}`, { method: "PUT", body: payload, silent: true });
      setState(id, { saving: false, saved: true });
    } catch (e) {
      setState(id, { saving: false, error: e.message });
    }
  }, []);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const edit = (draft, change) => {
    const payload = { ...draft.payload, ...change };
    onChange((current) => ({ ...current, drafts: current.drafts.map((item) => (item.id === draft.id ? { ...item, payload } : item)) }));
    setState(draft.id, { error: null });
    pending.current[draft.id] = { ...pending.current[draft.id], ...change };
    clearTimeout(timers.current[draft.id]);
    timers.current[draft.id] = setTimeout(() => persist(draft.id), SAVE_DELAY);
  };

  const addDraft = async (payload = {}) => {
    try {
      const result = await apiJson(`/api/task-draft-batches/${batch.id}/drafts`, { method: "POST", body: payload });
      onChange((current) => ({ ...current, drafts: [...current.drafts, result.data] }));
      setSelected((current) => new Set([...current, result.data.id]));
    } catch (e) {
      onError(e.message);
    }
  };
  const removeDraft = async (draft) => {
    try {
      const result = await apiJson(`/api/task-drafts/${draft.id}`, { method: "DELETE" });
      if (result.batch_deleted) {
        onDeleted();
        return;
      }
      onChange((current) => ({ ...current, drafts: current.drafts.filter((item) => item.id !== draft.id) }));
    } catch (e) {
      onError(e.message);
    }
  };

  const problemsOf = (payload) =>
    [
      !payload.title?.trim() && "Chưa có tên công việc",
      !payload.employee_ids.length && !payload.department_ids.length && "Chưa chọn người thực hiện",
      payload.due_at && payload.starts_at && payload.due_at < payload.starts_at && "Hạn hoàn thành trước ngày bắt đầu",
    ].filter(Boolean);
  const chosen = batch.drafts.filter((draft) => selected.has(draft.id));
  const ready = chosen.filter((draft) => !problemsOf(draft.payload).length);

  const publish = async () => {
    const blocked = chosen.length - ready.length;
    const ok = await confirm({
      title: `Tạo ${ready.length} công việc?`,
      message: `Người thực hiện và người duyệt sẽ nhận thông báo ngay.${blocked ? ` ${blocked} bản nháp còn thiếu thông tin sẽ được giữ lại.` : ""}`,
      confirmText: `Tạo ${ready.length} công việc`,
    });
    if (!ok) return;
    setPublishing(true);
    await Promise.all(ready.map((draft) => persist(draft.id)));
    const done = [];
    for (const draft of ready) {
      setState(draft.id, { publishing: true, error: null });
      const payload = draft.payload;
      const body = new FormData();
      body.append("draft_id", draft.id);
      body.append("title", payload.title.trim());
      body.append("description", payload.description ?? "");
      body.append("priority", payload.priority || "normal");
      body.append("share_submissions", payload.share_submissions === false ? "0" : "1");
      if (payload.category_id) body.append("category_id", payload.category_id);
      if (payload.starts_at) body.append("starts_at", payload.starts_at);
      if (payload.due_at) body.append("due_at", payload.due_at);
      payload.employee_ids.forEach((id) => body.append("employee_ids[]", id));
      payload.department_ids.forEach((id) => body.append("department_ids[]", id));
      payload.reviewer_ids.forEach((id) => body.append("reviewer_ids[]", id));
      try {
        const response = await apiFetch("/api/tasks", { method: "POST", headers: { Accept: "application/json" }, body });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(Object.values(result.errors ?? {}).flat()[0] ?? result.message ?? "Không tạo được công việc.");
        done.push({ id: draft.id, code: result.data.code, title: result.data.title });
        setState(draft.id, { publishing: false });
      } catch (e) {
        setState(draft.id, { publishing: false, error: e.message });
      }
    }
    setPublishing(false);
    if (!done.length) return;
    setCreated((current) => [...current, ...done]);
    const doneIds = new Set(done.map((item) => item.id));
    onChange((current) => ({ ...current, drafts: current.drafts.filter((draft) => !doneIds.has(draft.id)) }));
    setSelected((current) => new Set([...current].filter((id) => !doneIds.has(id))));
    onSuccess(`Đã tạo ${done.length} công việc.`);
  };

  const analysis = batch.analysis ?? {};
  const allSelected = batch.drafts.length > 0 && batch.drafts.every((draft) => selected.has(draft.id));

  return (
    <div className="ai-review">
      <aside className="ai-card ai-doc">
        <span className="ai-kind">{analysis.kind || "Văn bản"}</span>
        <h3>{analysis.title || batch.document_name}</h3>
        <dl>
          {analysis.number && <><dt>Số hiệu</dt><dd>{analysis.number}</dd></>}
          {analysis.issuer && <><dt>Nơi ban hành</dt><dd>{analysis.issuer}</dd></>}
          {analysis.issued_on && <><dt>Ngày ban hành</dt><dd>{shortDate(analysis.issued_on)}</dd></>}
        </dl>
        {analysis.deadlines?.length > 0 && (
          <div className="ai-doc-block">
            <b><CalendarClock size={14} /> Mốc thời gian</b>
            <ul className="ai-deadlines">
              {[...analysis.deadlines].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((item, index) => (
                <li key={index}><em>{item.date ? shortDate(item.date) : "—"}</em><span>{item.label}</span></li>
              ))}
            </ul>
          </div>
        )}
        {analysis.summary?.length > 0 && (
          <div className="ai-doc-block">
            <b>Nội dung chính</b>
            <ul className="ai-summary">{analysis.summary.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </div>
        )}
        <div className="ai-doc-block">
          <b><FileText size={14} /> Tài liệu ({batch.sources.length})</b>
          <ul className="ai-sources">
            {batch.sources.map((source, index) => (
              <li key={source.id}>
                <span className="ai-index">{index + 1}</span>
                <span>
                  <b title={source.name}>{source.name}</b>
                  <small>{[source.kind, source.origin === "library" ? "Chia sẻ chung" : "Tải lên"].filter(Boolean).join(" · ")}</small>
                </span>
                {source.available && (
                  <button type="button" className="ai-icon-btn" onClick={() => setPreview(index)} title="Xem tài liệu" aria-label={`Xem ${source.name}`}><ExternalLink size={14} /></button>
                )}
              </li>
            ))}
          </ul>
          <small className="ai-doc-file">Mỗi công việc chỉ đính kèm các tài liệu được đánh dấu trên thẻ nháp.</small>
        </div>
      </aside>

      <section className="ai-drafts">
        <div className="ai-toolbar">
          <label className="ai-check">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(batch.drafts.map((draft) => draft.id)))} />
            <span>{batch.drafts.length} bản nháp</span>
          </label>
          <button type="button" className="secondary-btn" onClick={() => addDraft()}><Plus size={15} /> Thêm việc</button>
          <span className="ai-toolbar-gap" />
          <button type="button" className="primary-btn" disabled={publishing || !ready.length} onClick={publish}>
            {publishing ? <><LoaderCircle size={15} className="spin" /> Đang tạo...</> : <><CheckCircle2 size={15} /> Tạo {ready.length} công việc</>}
          </button>
        </div>

        {created.length > 0 && (
          <div className="ai-created">
            <b><CheckCircle2 size={15} /> Đã tạo {created.length} công việc</b>
            <ul>{created.map((item) => <li key={item.code}><Link to={`/tasks/${item.code}`}>{item.code}</Link> {item.title}</li>)}</ul>
            {!batch.drafts.length && <Link className="primary-btn" to="/tasks">Về danh sách công việc</Link>}
          </div>
        )}

        {batch.drafts.map((draft, index) => (
          <DraftCard
            key={draft.id}
            index={index}
            draft={draft}
            refs={refs}
            state={states[draft.id] ?? {}}
            problems={problemsOf(draft.payload)}
            selected={selected.has(draft.id)}
            onSelect={() => setSelected((current) => {
              const next = new Set(current);
              if (next.has(draft.id)) next.delete(draft.id);
              else next.add(draft.id);
              return next;
            })}
            sources={batch.sources}
            onEdit={(change) => edit(draft, change)}
            onDuplicate={() => addDraft({ ...draft.payload, title: `${draft.payload.title} (bản sao)` })}
            onRemove={() => removeDraft(draft)}
            onOpenForm={() => onOpenForm(draft)}
          />
        ))}
      </section>

      {preview !== null && (
        <FilePreview
          files={batch.sources.filter((source) => source.available).map((source) => ({ key: source.id, name: source.name, mime_type: source.mime_type, size: source.size, url: source.url }))}
          startIndex={batch.sources.filter((source) => source.available).indexOf(batch.sources[preview])}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function DraftCard({ index, draft, refs, sources, state, problems, selected, onSelect, onEdit, onDuplicate, onRemove, onOpenForm }) {
  const payload = draft.payload;
  const [showDescription, setShowDescription] = useState(false);
  const editing = useMemo(() => ({ employee_ids: payload.employee_ids, department_ids: payload.department_ids }), [payload.employee_ids, payload.department_ids]);
  const toggle = (field, id) => onEdit({ [field]: payload[field].includes(id) ? payload[field].filter((x) => x !== id) : [...payload[field], id] });
  const reviewers = refs.reviewers.filter((reviewer) => !payload.employee_ids.includes(reviewer.employee_id));
  const plain = (payload.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return (
    <article className={`ai-card ai-draft ${selected ? "selected" : ""} ${state.error ? "failed" : ""}`}>
      <header>
        <input type="checkbox" checked={selected} onChange={onSelect} aria-label="Chọn bản nháp" />
        <span className="ai-index">{index + 1}</span>
        <input className="ai-title" value={payload.title} placeholder="Tên công việc" onChange={(event) => onEdit({ title: event.target.value })} />
        <span className="ai-save">{state.publishing ? <LoaderCircle size={14} className="spin" /> : state.saving ? "Đang lưu…" : state.saved ? "Đã lưu" : ""}</span>
        <ActionMenu
          items={[
            { key: "form", label: "Mở trong form", icon: PenLine, onClick: onOpenForm },
            { key: "copy", label: "Nhân bản", icon: Copy, onClick: onDuplicate },
            { key: "d", divider: true },
            { key: "remove", label: "Xóa bản nháp", icon: Trash2, danger: true, onClick: onRemove },
          ]}
        />
      </header>
      {payload.ai_reason && <p className="ai-reason"><Sparkles size={12} /> {payload.ai_reason}</p>}
      <div className="ai-grid">
        <div className="ai-field wide">
          <span>Người thực hiện</span>
          <CompactAssignees editing={editing} refs={refs} toggle={toggle} />
        </div>
        <div className="ai-field wide">
          <ReviewerPicker reviewers={reviewers} units={refs.units || []} value={payload.reviewer_ids} onChange={(update) => onEdit({ reviewer_ids: update(payload.reviewer_ids) })} />
        </div>
        <label className="ai-field">
          <span>Bắt đầu</span>
          <input type="datetime-local" value={payload.starts_at ?? ""} onChange={(event) => onEdit({ starts_at: event.target.value || null })} />
        </label>
        <label className="ai-field">
          <span>Hạn hoàn thành</span>
          <input type="datetime-local" value={payload.due_at ?? ""} onChange={(event) => onEdit({ due_at: event.target.value || null })} />
        </label>
        <div className="ai-field">
          <span>Mức ưu tiên</span>
          <Dropdown label="Mức ưu tiên" value={payload.priority} options={PRIORITIES.map(([value, label]) => ({ value, label }))} onChange={(value) => onEdit({ priority: value })} />
        </div>
        <div className="ai-field">
          <span>Loại nhiệm vụ</span>
          <Dropdown
            label="Loại nhiệm vụ"
            value={payload.category_id ?? ""}
            options={[{ value: "", label: "Không phân loại" }, ...refs.categories.map((category) => ({ value: category.id, label: category.name }))]}
            onChange={(value) => onEdit({ category_id: value === "" ? null : Number(value) })}
          />
        </div>
      </div>
      {sources.length > 0 && (
        <div className="ai-attach">
          <span>Đính kèm</span>
          {sources.map((source, position) => {
            const active = (payload.source_ids ?? []).includes(source.id);
            return (
              <button
                key={source.id}
                type="button"
                className={active ? "active" : ""}
                aria-pressed={active}
                title={active ? "Bấm để bỏ đính kèm" : "Bấm để đính kèm vào công việc"}
                onClick={() => onEdit({ source_ids: active ? payload.source_ids.filter((id) => id !== source.id) : [...(payload.source_ids ?? []), source.id] })}
              >
                <FileText size={12} /> {position + 1}. {source.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="ai-description">
        <button type="button" className={`ai-desc-toggle ${showDescription ? "open" : ""}`} onClick={() => setShowDescription(!showDescription)}>
          <span>Mô tả & yêu cầu</span> <ChevronDown size={14} />
          {!showDescription && plain && <small>{plain}</small>}
        </button>
        {showDescription && <RichTextEditor value={payload.description ?? ""} onChange={(description) => onEdit({ description })} />}
      </div>
      {(problems.length > 0 || state.error) && (
        <p className="ai-problem"><TriangleAlert size={13} /> {state.error ?? problems.join(" · ")}</p>
      )}
    </article>
  );
}
