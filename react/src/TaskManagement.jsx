import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Eye,
  FileText,
  Filter,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  TriangleAlert,
  UserRoundCheck,
  Users,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Strikethrough,
  Code2,
  Quote,
  ListOrdered,
  List,
  Link2,
  X,
} from "lucide-react";
import "./TaskManagement.css";
import TaskActionFilters, {
  TaskActionCards,
  emptyActionFilters,
} from "./TaskActionToolbar";
import "./TaskManagementOverrides.css";
import "./TaskAssignmentMode.css";
import "./TaskComposeLayout.css";
import "./TaskAttachmentPicker.css";
import "./RichEditorToolbar.css";
import "./TaskDetailRedesign.css";
import "./TaskAttachmentViewer.css";
import "./TaskCompletionWorkflow.css";
import "./ActionLoading.css";
import "./TaskWorkflowPanel.css";
import "./TaskDrawer.css";
import "./TaskComments.css";
import "./TaskAvatars.css";
import { apiFetch } from "./api";
import { ColumnPicker, NameStack, useScrollEdges, useTaskColumns } from "./TaskTable";
import PeoplePicker, { roleChips, useOutsideClose } from "./PeoplePicker";
import { useConfirm } from "./ConfirmDialog";

const labels = {
  status: {
    not_started: "Chưa thực hiện",
    in_progress: "Đang thực hiện",
    waiting_approval: "Chờ duyệt",
    completed: "Hoàn thành",
    cancelled: "Đã hủy",
  },
  priority: {
    low: "Thấp",
    normal: "Bình thường",
    high: "Cao",
    urgent: "Khẩn cấp",
  },
};
const emptyTask = {
  title: "",
  description: "",
  category_id: "",
  priority: "normal",
  starts_at: new Date().toISOString().slice(0, 16),
  due_at: "",
  reviewer_ids: [],
  teacher_ids: [],
  department_ids: [],
  document_ids: [],
  attachments: [],
  pending_files: [],
  removed_attachment_ids: [],
  assignment_mode: "assign",
};

export default function TaskManagement({ canAssign, canUpdate, selectedTask }) {
  const confirm = useConfirm();
  const columnState = useTaskColumns();
  const [tasks, setTasks] = useState([]),
    [meta, setMeta] = useState({
      current_page: 1,
      last_page: 1,
      per_page: 10,
      total: 0,
    }),
    [stats, setStats] = useState({
      total: 0,
      in_progress: 0,
      completed: 0,
      overdue: 0,
      waiting_approval: 0,
    });
  const [refs, setRefs] = useState({
      categories: [],
      filter_categories: [],
      teachers: [],
      departments: [],
      reviewers: [],
      documents: [],
      current_teacher: null,
    }),
    [filters, setFilters] = useState(emptyActionFilters),
    [page, setPage] = useState(1),
    [perPage, setPerPage] = useState(10),
    [documentSearch, setDocumentSearch] = useState("");
  const scrollEdges = useScrollEdges([tasks, columnState.hidden]);
  const currentUserId = refs.current_user_id;
  const formRef = useRef(null);
  const [formBaseline, setFormBaseline] = useState(null);
  const [, setFormTick] = useState(0);
  const [viewDraft, setViewDraft] = useState(false);
  const [commentDraft, setCommentDraft] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [editing, setEditing] = useState(null),
    [viewing, setViewing] = useState(null),
    [viewingDocument, setViewingDocument] = useState(null),
    [workflowSaving, setWorkflowSaving] = useState(false),
    [workflowError, setWorkflowError] = useState(""),
    [editingComment, setEditingComment] = useState(null),
    [deleting, setDeleting] = useState(null),
    [highlightedTaskId, setHighlightedTaskId] = useState(null),
    [reminding, setReminding] = useState(""),
    [saving, setSaving] = useState(false);
  const loadTasks = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError("");
      const p = new URLSearchParams({ page, per_page: perPage });
      Object.entries(filters).forEach(
        ([k, v]) => v !== "" && v != null && p.set(k, v),
      );
      try {
        const r = await apiFetch(`/api/tasks?${p}`, {
          headers: { Accept: "application/json" },
          silent,
        });
        const d = await r.json();
        if (!r.ok)
          throw new Error(
            Object.values(d.errors || {}).flat()[0] ||
              d.message ||
              "Không thể tải danh sách công việc.",
          );
        setTasks(d.data);
        setMeta(d.meta);
        setStats(d.stats);
        window.dispatchEvent(
          new CustomEvent("task-stats:updated", { detail: d.stats }),
        );
      } catch (e) {
        setError(e.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, perPage, filters],
  );
  useEffect(() => {
    apiFetch("/api/tasks-reference-data", {
      headers: { Accept: "application/json" },
    })
      .then((r) => r.json())
      .then(setRefs)
      .catch(() => setError("Không thể tải dữ liệu giao việc."));
  }, []);
  useEffect(() => {
    const t = setTimeout(loadTasks, 250);
    return () => clearTimeout(t);
  }, [loadTasks]);
  useEffect(() => {
    const refreshTasks = () => loadTasks(true);
    window.addEventListener("tasks:changed", refreshTasks);
    return () => window.removeEventListener("tasks:changed", refreshTasks);
  }, [loadTasks]);
  useEffect(() => {
    if (selectedTask?.filter) {
      setFilters({ ...emptyActionFilters, ...selectedTask.filter });
      setPage(1);
      setHighlightedTaskId(null);
    } else if (selectedTask?.id) {
      setHighlightedTaskId(selectedTask.id);
    }
  }, [selectedTask?.id, selectedTask?.token]);
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(t);
  }, [success]);
  const reset = () => {
      setFilters({ ...emptyActionFilters });
      setPage(1);
    },
    openCreate = (assignmentMode) => {
      const teacherId = refs.current_teacher?.id;
      setEditing({
        ...emptyTask,
        assignment_mode: assignmentMode,
        teacher_ids: assignmentMode === "self" && teacherId ? [teacherId] : [],
      });
      setDocumentSearch("");
    };
  const openEdit = async (task) => {
    try {
      const r = await apiFetch(`/api/tasks/${task.id}`, {
          headers: { Accept: "application/json" },
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setEditing({
        ...d.data,
        assignment_mode: task.can_edit_personal ? "self" : "assign",
      });
    } catch (e) {
      setError(e.message);
    }
  };
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const f = new FormData(e.currentTarget);
    f.delete("teacher_ids");
    f.delete("department_ids");
    f.delete("document_ids");
    f.delete("attachments");
    editing.teacher_ids.forEach((id) => f.append("teacher_ids[]", id));
    editing.department_ids.forEach((id) => f.append("department_ids[]", id));
    editing.document_ids.forEach((id) => f.append("document_ids[]", id));
    editing.pending_files?.forEach((file) => f.append("attachments[]", file));
    editing.removed_attachment_ids?.forEach((id) =>
      f.append("remove_attachment_ids[]", id),
    );
    if (editing.id) f.append("_method", "PUT");
    try {
      const endpoint =
        editing.assignment_mode === "self"
          ? editing.id
            ? `/api/personal-tasks/${editing.id}`
            : "/api/personal-tasks"
          : editing.id
            ? `/api/tasks/${editing.id}`
            : "/api/tasks";
      const r = await apiFetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: f,
        }),
        d = await r.json();
      if (!r.ok)
        throw new Error(Object.values(d.errors ?? {}).flat()[0] ?? d.message);
      setEditing(null);
      setSuccess(d.message);
      await loadTasks();
    } catch (x) {
      setError(x.message);
    } finally {
      setSaving(false);
    }
  };
  const show = async (task) => {
    try {
      const r = await apiFetch(`/api/tasks/${task.id}`, {
          headers: { Accept: "application/json" },
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setViewing(d.data);
      setWorkflowError("");
      setViewingDocument(null);
    } catch (e) {
      setError(e.message);
    }
  };
  const showLinkedDocument = async (document) => {
    try {
      const response = await apiFetch(`/api/documents/${document.id}`, {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message);
      setViewingDocument(payload.data);
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = async () => {
    try {
      const r = await apiFetch(`/api/${deleting.can_edit_personal ? "personal-tasks" : "tasks"}/${deleting.id}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setDeleting(null);
      setSuccess(d.message);
      await loadTasks();
    } catch (e) {
      setDeleting(null);
      setError(e.message);
    }
  };
  const downloadDocument = async (document) => {
    try {
      const r = await apiFetch(document.download_url, {
        headers: { Accept: "application/octet-stream" },
      });
      if (!r.ok) throw new Error("Không thể tải văn bản.");
      const url = URL.createObjectURL(await r.blob()),
        a = window.document.createElement("a");
      a.href = url;
      a.download = document.file_name || document.title;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  };
  const sendReminder = async (task) => {
    setReminding(task.id);
    setError("");
    try {
      const response = await apiFetch(`/api/tasks/${task.id}/remind`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Không thể gửi email nhắc việc.");
      setSuccess(payload.message);
      await loadTasks(true);
    } catch (exception) {
      setError(exception.message);
    } finally {
      setReminding("");
    }
  };
  const viewTaskAttachment = async (file) => {
    const tab = window.open("", "_blank");
    if (tab)
      tab.document.body.innerHTML =
        '<p style="font-family:sans-serif;padding:24px">Đang mở file...</p>';
    try {
      const response = await apiFetch(
        `/api/tasks/${viewing.id}/attachments/${file.id}`,
        { headers: { Accept: file.mime_type || "application/octet-stream" } },
      );
      if (!response.ok) throw new Error("Không thể mở file đính kèm.");
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      tab?.close();
      setError(e.message);
    }
  };
  const viewSubmissionAttachment = async (submission, file) => {
    const tab = window.open("", "_blank");
    if (tab)
      tab.document.body.innerHTML =
        '<p style="font-family:sans-serif;padding:24px">Đang mở bài nộp...</p>';
    try {
      const response = await apiFetch(
        `/api/tasks/${viewing.id}/submissions/${submission.id}/attachments/${file.id}`,
        { headers: { Accept: file.mime_type || "application/octet-stream" } },
      );
      if (!response.ok) throw new Error("Không thể mở file bài nộp.");
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      tab?.close();
      setError(e.message);
    }
  };
  const saveComment = async (event) => {
    event.preventDefault();
    const content = new FormData(event.currentTarget).get("content");
    const response = await apiFetch(
      `/api/tasks/${viewing.id}/comments/${editingComment.id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ content }),
      },
    );
    const payload = await response.json();
    if (!response.ok)
      return setError(
        Object.values(payload.errors || {}).flat()[0] || payload.message,
      );
    setEditingComment(null);
    setSuccess(payload.message);
    await show(viewing);
  };
  const runWorkflow = async (path, options, fallbackError) => {
    setWorkflowSaving(true);
    setWorkflowError("");
    try {
      const response = await apiFetch(`/api/tasks/${viewing.id}/${path}`, {
        method: "POST",
        headers: { Accept: "application/json", ...(options.json ? { "Content-Type": "application/json" } : {}) },
        body: options.json ? JSON.stringify(options.json) : options.body,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(Object.values(payload.errors || {}).flat()[0] || payload.message);
      setSuccess(payload.message);
      await show(viewing);
      await loadTasks(true);
      return true;
    } catch (workflowException) {
      setWorkflowError(workflowException.message || fallbackError);
      return false;
    } finally {
      setWorkflowSaving(false);
    }
  };
  const startTask = () =>
    runWorkflow("progress", { json: { status: "in_progress" } }, "Không thể cập nhật trạng thái.");
  const submitCompletion = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const links = String(form.get("submission_links") || "");
    form.delete("submission_links");
    links
      .split(/\r?\n/)
      .map((link) => link.trim())
      .filter(Boolean)
      .forEach((link) => form.append("links[]", link));
    if (await runWorkflow("submit-completion", { body: form }, "Không thể gửi đề nghị hoàn thành."))
      formElement.reset();
  };
  const reviewCompletion = async (event) => {
    event.preventDefault();
    const decision = event.nativeEvent.submitter?.value;
    const comment = new FormData(event.currentTarget).get("comment");
    await runWorkflow("review-completion", { json: { decision, comment } }, "Không thể duyệt công việc.");
  };
  const selfComplete = () =>
    runWorkflow("complete", { json: {} }, "Không thể đánh dấu hoàn thành.");
  const cancelTask = async () => {
    const ok = await confirm({
      tone: "danger",
      title: `Hủy công việc ${viewing.code}?`,
      message: viewing.is_personal
        ? "Công việc sẽ chuyển sang trạng thái Đã hủy."
        : "Công việc sẽ chuyển sang trạng thái Đã hủy và người thực hiện sẽ nhận được thông báo.",
      confirmText: "Hủy công việc",
      cancelText: "Giữ lại",
    });
    if (ok) await runWorkflow("cancel", { json: {} }, "Không thể hủy công việc.");
  };
  const postComment = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const content = new FormData(formElement).get("content");
    if (!String(content || "").trim()) return;
    if (await runWorkflow("comments", { json: { content } }, "Không thể gửi trao đổi."))
      formElement.reset();
  };
  useEffect(() => {
    if (editing && formBaseline === null && formRef.current) setFormBaseline(taskFormSnapshot(formRef.current, editing));
    if (!editing && formBaseline !== null) setFormBaseline(null);
  }, [editing, formBaseline]);
  useEffect(() => {
    if (editing) setShowSupport((editing.document_ids?.length || 0) + (editing.attachments?.length || 0) > 0);
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const formDirty = formBaseline !== null && taskFormSnapshot(formRef.current, editing) !== formBaseline;
  const attachmentCount = editing
    ? editing.document_ids.length + (editing.pending_files?.length || 0) + (editing.attachments?.length || 0) - (editing.removed_attachment_ids?.length || 0)
    : 0;
  const formMissing = editing
    ? [
        !formRef.current?.elements.title?.value.trim() && "tên công việc",
        editing.assignment_mode !== "self" && !editing.teacher_ids.length && !editing.department_ids.length && "người thực hiện",
      ].filter(Boolean)
    : [];
  const formBlocked = formMissing.length
    ? `Còn thiếu: ${formMissing.join(", ")}`
    : editing?.id && !formDirty
      ? "Chưa có thay đổi"
      : "";
  const discardChanges = (message) =>
    confirm({
      tone: "warning",
      title: "Bỏ các thay đổi chưa lưu?",
      message,
      confirmText: "Bỏ thay đổi",
      cancelText: "Tiếp tục chỉnh sửa",
    });
  const requestCloseEdit = async () => {
    if (formDirty && !(await discardChanges("Nội dung bạn vừa nhập cho công việc này sẽ không được lưu."))) return;
    setEditing(null);
  };
  const requestCloseView = async () => {
    if ((viewDraft || commentDraft) && !(await discardChanges("Kết quả, nhận xét hoặc trao đổi bạn đang nhập sẽ không được gửi."))) return false;
    setViewDraft(false);
    setCommentDraft(false);
    setViewing(null);
    return true;
  };
  const toggle = (field, id) =>
    setEditing((c) => {
      const adding = !c[field].includes(id);
      const reviewer = field === "teacher_ids" && adding ? refs.reviewers.find((r) => r.teacher_id === id) : null;
      return {
        ...c,
        [field]: adding ? [...c[field], id] : c[field].filter((x) => x !== id),
        ...(reviewer ? { reviewer_ids: (c.reviewer_ids || []).filter((x) => x !== reviewer.id) } : {}),
      };
    });
  return (
    <div
      className={`task-page ${canAssign ? "" : "no-assign"} ${canUpdate ? "" : "no-update"}`}
    >
      {success && (
        <div className="success-toast">
          <span>
            <CheckCircle2 size={20} />
          </span>
          <div>
            <b>Thành công</b>
            <small>{success}</small>
          </div>
          <button onClick={() => setSuccess("")}>
            <X size={17} />
          </button>
        </div>
      )}
      <TaskActionCards
        stats={stats}
        action={filters.action}
        onSelect={(action) => {
          setFilters({ ...emptyActionFilters, action });
          setPage(1);
        }}
      />
      <section className="task-toolbar">
        <div className="task-heading">
          <div>
            <h2>Danh sách công việc</h2>
            <p>Chọn nhóm công việc cần xử lý và thực hiện ngay</p>
          </div>
          <div className="task-create-actions">
            {canAssign && (
              <button
                className="primary-btn"
                onClick={() => openCreate("assign")}
              >
                <Users size={17} /> Giao việc cho người khác
              </button>
            )}
            {canUpdate && refs.current_teacher && (
              <button
                className="personal-task-btn"
                onClick={() => openCreate("self")}
              >
                <Plus size={17} /> Tạo việc cho chính mình
              </button>
            )}
          </div>
        </div>
        <TaskActionFilters
          filters={filters}
          refs={refs}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          onReset={reset}
        />
      </section>
      <section className="task-table-card">
        {error && (
          <div className="api-error">
            <TriangleAlert size={16} />
            {error}
            <button onClick={loadTasks}>Thử lại</button>
          </div>
        )}
        <div className="task-table-toolbar">
          <span>{meta.total} công việc</span>
          <ColumnPicker state={columnState} />
        </div>
        <div ref={scrollEdges.ref} onScroll={scrollEdges.onScroll} className={`task-table-wrap ${scrollEdges.className}`}>
          <table className="task-table">
            <thead>
              <tr>
                {columnState.columns.map((c) => (
                  <th key={c.key} className={`col-${c.key}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const reminderCount = Math.max(0, ...(t.assignees || []).map((person) => Number(person.reminder_count || 0)));
                const cells = {
                  task: (
                    <td className="task-name">
                      <code>{t.code}</code>
                      <b title={t.title}>{t.title}</b>
                    </td>
                  ),
                  category: <td>{t.category ? <span className="task-type-name">{t.category}</span> : <span className="name-stack-empty">—</span>}</td>,
                  assignees: (
                    <td>
                      <NameStack
                        empty="Chưa phân công"
                        title={`Người thực hiện · ${t.assignee_count} người`}
                        items={[
                          ...(t.units || []).map((unit) => ({ key: `d-${unit.id}`, label: `${unit.short_name} · ${unit.members.length}`, kind: "unit" })),
                          ...(t.assignees || []).filter((person) => person.direct).map((person) => ({ key: `p-${person.id}`, label: person.name })),
                        ]}
                        details={[
                          ...(t.units || []).map((unit) => ({ key: `d-${unit.id}`, title: unit.name, names: unit.members.map((member) => member.name) })),
                          ...((t.assignees || []).some((person) => person.direct)
                            ? [{ key: "direct", title: "Cá nhân", names: t.assignees.filter((person) => person.direct).map((person) => person.name) }]
                            : []),
                        ]}
                      />
                    </td>
                  ),
                  reviewer: (
                    <td>
                      <NameStack
                        empty={t.is_personal ? "Tự hoàn thành" : "Người giao duyệt"}
                        title={`Người duyệt · ${t.reviewers?.length || 0} người`}
                        items={(t.reviewers || []).map((r) => ({ key: `r-${r.id}`, label: t.is_reviewer && r.id === currentUserId ? `${r.name} (bạn)` : r.name, kind: t.is_reviewer && r.id === currentUserId ? "me" : "" }))}
                        details={t.reviewers?.length > 2 ? [{ key: "reviewers", title: "Bất kỳ ai trong danh sách đều duyệt được", names: t.reviewers.map((r) => r.name) }] : undefined}
                      />
                    </td>
                  ),
                  creator: <td><span className="name-chip">{t.creator || "Quản trị"}</span></td>,
                  completed: (
                    <td>
                      {t.status === "completed" && t.completed_at ? (
                        <span className={t.is_late ? "done-at late" : "done-at"} title={t.finished_at ? `Nộp lúc ${formatMoment(t.finished_at)}` : undefined}>
                          {formatMoment(t.completed_at)}
                        </span>
                      ) : (
                        <span className="name-stack-empty">—</span>
                      )}
                    </td>
                  ),
                  due: (
                    <td>
                      <span className={t.is_overdue ? "due overdue" : "due"}>
                        <CalendarClock size={14} />
                        {t.due_at
                          ? new Date(t.due_at).toLocaleString("vi-VN", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "Không thời hạn"}
                      </span>
                    </td>
                  ),
                  priority: (
                    <td>
                      <span className={`priority ${t.priority}`}>
                        <i />
                        {labels.priority[t.priority]}
                      </span>
                    </td>
                  ),
                  status: (
                    <td>
                      <TaskStatusBadges task={t} />
                    </td>
                  ),
                  actions: (
                    <td>
                      <div className="row-actions">
                        <button title="Xem" onClick={() => show(t)}>
                          <Eye size={15} />
                        </button>
                        {t.can_manage && ["not_started", "in_progress"].includes(t.status) && t.assignees?.length > 0 && (
                          <button
                            className="remind"
                            title={`Gửi email nhắc việc cho tất cả người thực hiện${reminderCount ? ` (đã nhắc ${reminderCount} lần)` : ""}`}
                            disabled={reminding === t.id}
                            onClick={() => sendReminder(t)}
                          >
                            <Send size={15} />
                            {reminderCount > 0 && <em>{reminderCount}</em>}
                          </button>
                        )}
                        {(t.can_manage || t.can_edit_personal) && (
                          <button title="Sửa" onClick={() => openEdit(t)}>
                            <Pencil size={15} />
                          </button>
                        )}
                        {t.can_manage && (
                          <button
                            className="delete"
                            title="Xóa"
                            onClick={() => setDeleting(t)}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  ),
                };
                return (
                  <tr
                    key={t.id}
                    className={
                      highlightedTaskId === t.id ? "notification-active-task" : ""
                    }
                  >
                    {columnState.columns.map((c) => (
                      <Fragment key={c.key}>{cells[c.key]}</Fragment>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading ? (
            <div className="empty-state">
              <Activity className="loading-icon" size={36} />
              <b>Đang tải công việc...</b>
            </div>
          ) : (
            !tasks.length && (
              <div className="empty-state">
                <ClipboardCheck size={36} />
                <b>Chưa có công việc phù hợp</b>
                <span>Hãy giao công việc mới hoặc thay đổi bộ lọc.</span>
              </div>
            )
          )}
        </div>
        <div className="pagination">
          <span>
            Hiển thị{" "}
            <b>
              {meta.total ? (meta.current_page - 1) * meta.per_page + 1 : 0}–
              {Math.min(meta.current_page * meta.per_page, meta.total)}
            </b>{" "}
            trong {meta.total} kết quả
          </span>
          <div>
            <label>
              Số dòng{" "}
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(+e.target.value);
                  setPage(1);
                }}
              >
                <option>5</option>
                <option>10</option>
                <option>20</option>
              </select>
            </label>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: meta.last_page }, (_, i) => (
              <button
                className={page === i + 1 ? "active" : ""}
                key={i}
                onClick={() => setPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={page === meta.last_page}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      {editing && (
        <div className="modal-backdrop">
          <div className="task-modal">
            <div className="modal-head">
              <div>
                <h3>
                  {editing.id
                    ? "Chỉnh sửa công việc"
                    : editing.assignment_mode === "self"
                      ? "Tạo công việc cho chính mình"
                      : "Giao công việc cho người khác"}
                </h3>
                <p>Thông tin rõ ràng giúp giáo viên hoàn thành đúng yêu cầu</p>
              </div>
              <button onClick={requestCloseEdit}>
                <X size={20} />
              </button>
            </div>
            <form ref={formRef} onSubmit={save} onInput={() => setFormTick((tick) => tick + 1)} onChange={() => setFormTick((tick) => tick + 1)}>
              <div className="task-compose-body">
                <div className="task-compose-main">
                  <section className="form-block">
                    <label className="field">
                      <span className="field-label">
                        Tên công việc <span className="required-mark">*</span>
                      </span>
                      <input
                        name="title"
                        required
                        defaultValue={editing.title}
                        placeholder="Nhập tên công việc ngắn gọn..."
                      />
                    </label>
                    <div className="field">
                      <span className="field-label">Mô tả</span>
                      <RichTextEditor
                        value={editing.description || ""}
                        onChange={(description) =>
                          setEditing({ ...editing, description })
                        }
                      />
                      <input
                        type="hidden"
                        name="description"
                        value={editing.description || ""}
                      />
                    </div>
                  </section>
                  <section className="form-block">
                    <button
                      type="button"
                      className="block-toggle"
                      aria-expanded={showSupport}
                      onClick={() => setShowSupport(!showSupport)}
                    >
                      <Paperclip size={15} />
                      <span>
                        Văn bản & file đính kèm
                        {attachmentCount > 0 && <em>{attachmentCount}</em>}
                      </span>
                      <ChevronDown size={16} className={showSupport ? "open" : ""} />
                    </button>
                    {showSupport && (
                      <div className="block-body">
                        <span className="field-label">Văn bản liên quan</span>
                        <label className="document-search">
                          <Search size={16} />
                          <input
                            value={documentSearch}
                            onChange={(event) =>
                              setDocumentSearch(event.target.value)
                            }
                            placeholder="Tìm theo số, tên hoặc đơn vị ban hành..."
                          />
                        </label>
                        <div className="document-picker">
                          {refs.documents
                            .filter((document) =>
                              `${document.document_number} ${document.title} ${document.issuer}`
                                .toLowerCase()
                                .includes(documentSearch.toLowerCase()),
                            )
                            .map((document) => (
                              <label key={document.id}>
                                <input
                                  type="checkbox"
                                  checked={editing.document_ids.includes(
                                    document.id,
                                  )}
                                  onChange={() =>
                                    toggle("document_ids", document.id)
                                  }
                                />
                                <span>
                                  <b>{document.document_number}</b>
                                  <strong>{document.title}</strong>
                                  <small>
                                    {document.type} · {document.issuer}
                                    {document.issued_on
                                      ? ` · ${new Date(document.issued_on).toLocaleDateString("vi-VN")}`
                                      : ""}
                                  </small>
                                </span>
                                {document.has_file && <Paperclip size={15} />}
                              </label>
                            ))}
                        </div>
                        {!refs.documents.length && (
                          <div className="no-documents">
                            Chưa có văn bản trong mục Quản lý văn bản.
                          </div>
                        )}
                        <span className="field-label">File đính kèm</span>
                        <FileAttachmentPicker
                          editing={editing}
                          setEditing={setEditing}
                        />
                      </div>
                    )}
                  </section>
                </div>
                <div className="task-compose-aside">
                  <section
                    className={`form-block ${editing.assignment_mode === "self" ? "personal-assignment" : ""}`}
                  >
                    <h4>Phân công</h4>
                    {!editing.id && canAssign && canUpdate && refs.current_teacher && (
                      <div className="assignment-mode-picker" role="group" aria-label="Cách phân công">
                        <button
                          type="button"
                          className={editing.assignment_mode === "assign" ? "active" : ""}
                          onClick={() =>
                            setEditing({
                              ...editing,
                              assignment_mode: "assign",
                              teacher_ids: [],
                              department_ids: [],
                            })
                          }
                        >
                          <Users size={15} /> Giao cho người khác
                        </button>
                        <button
                          type="button"
                          className={editing.assignment_mode === "self" ? "active" : ""}
                          onClick={() =>
                            setEditing({
                              ...editing,
                              assignment_mode: "self",
                              teacher_ids: [refs.current_teacher.id],
                              department_ids: [],
                            })
                          }
                        >
                          <UserRoundCheck size={15} /> Tự giao cho mình
                        </button>
                      </div>
                    )}
                    {editing.assignment_mode === "self" && !editing.id ? (
                      <div className="personal-assignee-card">
                        {refs.current_teacher?.avatar_url ? (
                          <img
                            src={refs.current_teacher.avatar_url}
                            alt="Ảnh đại diện"
                          />
                        ) : (
                          <UserRoundCheck size={20} />
                        )}
                        <div>
                          <b>{refs.current_teacher?.name}</b>
                          <small>Bạn là người thực hiện công việc này</small>
                        </div>
                      </div>
                    ) : (
                      <div className="field">
                        <span className="field-label">
                          Người thực hiện <span className="required-mark">*</span>
                        </span>
                        <CompactAssignees
                          editing={editing}
                          refs={refs}
                          toggle={toggle}
                        />
                      </div>
                    )}
                    <ReviewerPicker
                      reviewers={refs.reviewers.filter((r) => editing.assignment_mode === "self" ? r.id !== refs.current_teacher?.user_id : !editing.teacher_ids.includes(r.teacher_id))}
                      units={refs.units || []}
                      value={editing.reviewer_ids || []}
                      onChange={(update) =>
                        setEditing((c) => ({ ...c, reviewer_ids: update(c.reviewer_ids || []) }))
                      }
                    />
                  </section>
                  <section className="form-block">
                    <h4>Thời hạn & ưu tiên</h4>
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">Bắt đầu</span>
                        <input
                          name="starts_at"
                          type="datetime-local"
                          defaultValue={editing.starts_at}
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">Hạn hoàn thành</span>
                        <input
                          name="due_at"
                          type="datetime-local"
                          defaultValue={editing.due_at}
                        />
                      </label>
                    </div>
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">
                          Mức ưu tiên <span className="required-mark">*</span>
                        </span>
                        <select name="priority" defaultValue={editing.priority}>
                          {Object.entries(labels.priority).map(
                            ([value, text]) => (
                              <option value={value} key={value}>
                                {text}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label">Loại nhiệm vụ</span>
                        <select name="category_id" defaultValue={editing.category_id || ""}>
                          <option value="">— Không phân loại —</option>
                          {refs.categories.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                            </option>
                          ))}
                          {editing.category_id && !refs.categories.some((type) => type.id === Number(editing.category_id)) && (
                            <option value={editing.category_id}>{editing.category} (ngưng sử dụng)</option>
                          )}
                        </select>
                      </label>
                    </div>
                  </section>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={requestCloseEdit}
                >
                  Hủy bỏ
                </button>
                <button className="primary-btn" disabled={saving || !!formBlocked} title={formBlocked || undefined}>
                  <Send size={15} />
                  {saving
                    ? "Đang lưu..."
                    : editing.id
                      ? "Lưu thay đổi"
                      : editing.assignment_mode === "self"
                        ? "Tạo công việc"
                        : "Giao công việc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {viewing && (
        <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && requestCloseView()}>
          <aside className="task-drawer" role="dialog" aria-modal="true" aria-label={`Chi tiết ${viewing.code}`}>
            <header className="task-drawer-head">
              <div>
                <div className="task-drawer-tags">
                  <code>{viewing.code}</code>
                  <span className={`priority ${viewing.priority}`}>
                    <i />
                    {labels.priority[viewing.priority]}
                  </span>
                  <TaskStatusBadges task={viewing} />
                  {viewing.category && <span className="task-drawer-type">{viewing.category}</span>}
                </div>
                <h2>{viewing.title}</h2>
              </div>
              <div className="task-drawer-head-actions">
                {(viewing.can_manage || viewing.can_edit_personal) && !["completed", "cancelled"].includes(viewing.status) && (
                  <button type="button" title="Sửa" onClick={async () => { const task = viewing; if (await requestCloseView()) openEdit(task); }}>
                    <Pencil size={17} />
                  </button>
                )}
                <button type="button" title="Đóng" onClick={requestCloseView}>
                  <X size={19} />
                </button>
              </div>
            </header>
            <div className="task-drawer-body">
              <TaskTimeline task={viewing} />
              <div className="task-drawer-people">
                <div className="person-row">
                  <span>Người giao</span>
                  <PersonCards people={viewing.creator_card ? [viewing.creator_card] : []} empty="Quản trị" />
                </div>
                <div className="person-row">
                  <span>Người duyệt</span>
                  <PersonCards
                    people={viewing.reviewer_cards || []}
                    empty={viewing.is_personal ? "Tự hoàn thành" : "Người giao duyệt"}
                  />
                </div>
                <div className="person-row">
                  <span>Người thực hiện</span>
                  <NameStack
                    max={4}
                    empty="Chưa phân công"
                    title={`Người thực hiện · ${viewing.assignee_count} người`}
                    items={[
                      ...(viewing.units || []).map((unit) => ({ key: `d-${unit.id}`, label: `${unit.short_name} · ${unit.members.length}`, kind: "unit" })),
                      ...(viewing.assignees || []).filter((person) => person.direct).map((person) => ({ key: `p-${person.id}`, label: person.name, person })),
                    ]}
                    details={[
                      ...(viewing.units || []).map((unit) => ({ key: `d-${unit.id}`, title: unit.name, names: unit.members.map((member) => member.name) })),
                      ...((viewing.assignees || []).some((person) => person.direct)
                        ? [{ key: "direct", title: "Cá nhân", names: viewing.assignees.filter((person) => person.direct).map((person) => person.name) }]
                        : []),
                    ]}
                  />
                </div>
              </div>
              <TaskWorkflowPanel
                task={viewing}
                saving={workflowSaving}
                error={workflowError}
                onStart={startTask}
                onSubmit={submitCompletion}
                onReview={reviewCompletion}
                onSelfComplete={selfComplete}
                onDraftChange={setViewDraft}
              />
              {viewing.description && (
                <section className="drawer-section">
                  <h4>Mô tả</h4>
                  <div
                    className="rich-description"
                    dangerouslySetInnerHTML={{
                      __html: viewing.description,
                    }}
                  />
                </section>
              )}
              {!!viewing.documents?.length && (
                <section className="drawer-section">
                  <h4>Văn bản liên quan <em>{viewing.documents.length}</em></h4>
                  <div className="linked-documents">
                    {viewing.documents.map((document) => (
                      <article key={document.id}>
                        <span>
                          <FileText size={18} />
                        </span>
                        <div>
                          <b>{document.document_number}</b>
                          <strong>{document.title}</strong>
                          <small>
                            {document.type} · {document.issuer}
                          </small>
                        </div>
                        <div className="linked-document-actions">
                          <button
                            className="document-detail-btn"
                            onClick={() => showLinkedDocument(document)}
                          >
                            <Eye size={14} /> Chi tiết
                          </button>
                          {document.download_url && (
                            <button onClick={() => downloadDocument(document)}>
                              <Paperclip size={14} /> Tải file
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {viewingDocument && (
                <section className="linked-document-detail">
                  <div className="linked-detail-head">
                    <div>
                      <small>CHI TIẾT VĂN BẢN</small>
                      <h3>{viewingDocument.title}</h3>
                    </div>
                    <button onClick={() => setViewingDocument(null)}>
                      <X size={17} />
                    </button>
                  </div>
                  <dl>
                    <div>
                      <dt>Số hiệu</dt>
                      <dd>{viewingDocument.document_number}</dd>
                    </div>
                    <div>
                      <dt>Loại văn bản</dt>
                      <dd>{viewingDocument.document_type}</dd>
                    </div>
                    <div>
                      <dt>Đơn vị ban hành</dt>
                      <dd>{viewingDocument.issuer}</dd>
                    </div>
                    <div>
                      <dt>Ngày ban hành</dt>
                      <dd>
                        {viewingDocument.issued_on
                          ? new Date(viewingDocument.issued_on).toLocaleDateString("vi-VN")
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Ngày hiệu lực</dt>
                      <dd>
                        {viewingDocument.effective_on
                          ? new Date(viewingDocument.effective_on).toLocaleDateString("vi-VN")
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Trạng thái</dt>
                      <dd>{viewingDocument.status}</dd>
                    </div>
                    <div>
                      <dt>Chiều văn bản</dt>
                      <dd>{viewingDocument.direction}</dd>
                    </div>
                    <div>
                      <dt>Tệp đính kèm</dt>
                      <dd>{viewingDocument.file_name || "Không có file"}</dd>
                    </div>
                  </dl>
                  <div className="document-summary">
                    <b>Nội dung tóm tắt</b>
                    <p>{viewingDocument.summary || "Chưa có nội dung tóm tắt."}</p>
                  </div>
                  {viewingDocument.download_url && (
                    <button
                      className="primary-btn"
                      onClick={() => downloadDocument(viewingDocument)}
                    >
                      <Paperclip size={15} /> Tải văn bản
                    </button>
                  )}
                </section>
              )}
              {!!viewing.attachments?.length && (
                <section className="drawer-section">
                  <h4>File đính kèm <em>{viewing.attachments.length}</em></h4>
                  <div className="detail-attachments">
                    {viewing.attachments.map((file) => (
                      <button
                        type="button"
                        key={file.id}
                        onClick={() => viewTaskAttachment(file)}
                        title="Mở file trong tab mới"
                      >
                        <i>
                          <Paperclip size={16} />
                        </i>
                        <div>
                          <b>{file.original_name}</b>
                          <small>{formatFileSize(file.size)}</small>
                        </div>
                        <Eye size={16} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {!!viewing.submissions?.length && (
                <section className="drawer-section teacher-submissions">
                  <h4>Bài nộp <em>{viewing.submissions.length}</em></h4>
                  <div className="submission-list">
                    {viewing.submissions.map((submission) => (
                      <article key={submission.id}>
                        <header>
                          {submission.submitter_avatar_url ? (
                            <img
                              className="submission-avatar"
                              src={submission.submitter_avatar_url}
                              alt={`Ảnh của ${submission.submitter}`}
                            />
                          ) : (
                            <i className="submission-avatar-fallback">
                              {submission.submitter?.charAt(0)}
                            </i>
                          )}
                          <div>
                            <strong>{submission.submitter}</strong>
                            <span>Lần nộp {submission.version}</span>
                          </div>
                          <small>Nộp {formatMoment(submission.submitted_at)}</small>
                        </header>
                        {submission.result_content && <p>{submission.result_content}</p>}
                        {submission.status !== "submitted" && submission.reviewed_at && (
                          <div className={`submission-review ${submission.status}`}>
                            {submission.status === "approved" ? <CheckCircle2 size={14} /> : <RotateCcw size={14} />}
                            <span>
                              {submission.status === "approved" ? "Được duyệt" : "Yêu cầu chỉnh sửa"}
                              {submission.reviewer && <> bởi <b>{submission.reviewer}</b></>} · {formatMoment(submission.reviewed_at)}
                              {submission.review_comment && <em>“{submission.review_comment}”</em>}
                            </span>
                          </div>
                        )}
                        {!!submission.files?.length && (
                          <div className="submission-resources">
                            {submission.files.map((file) => (
                              <button
                                type="button"
                                key={file.id}
                                onClick={() => viewSubmissionAttachment(submission, file)}
                                title="Mở file bài nộp trong tab mới"
                              >
                                <Paperclip size={15} />
                                <span>{file.original_name}</span>
                                <small>{formatFileSize(file.size)}</small>
                                <Eye size={15} />
                              </button>
                            ))}
                          </div>
                        )}
                        {!!submission.links?.length && (
                          <div className="submission-links">
                            {submission.links.map((link) => (
                              <a key={link} href={link} target="_blank" rel="noopener noreferrer">
                                <Link2 size={15} />
                                <span>{link}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <section className="drawer-section comment-timeline">
                <h4>Trao đổi {!!viewing.updates?.length && <em>{viewing.updates.length}</em>}</h4>
                {!!viewing.updates?.length && (
                  <div className="comment-list">
                    {viewing.updates.map((comment) => (
                      <article className={`comment-item ${comment.author_role}`} key={comment.id}>
                        {comment.creator_avatar_url ? (
                          <img className="comment-avatar" src={comment.creator_avatar_url} alt={`Ảnh của ${comment.creator_name}`} />
                        ) : (
                          <i>{comment.creator_name?.charAt(0) || "?"}</i>
                        )}
                        <div>
                          <header>
                            <span>
                              <b>{comment.creator_name || "Người dùng"}</b>
                              <em>
                                {comment.author_role === "reviewer"
                                  ? "Người duyệt"
                                  : comment.author_role === "assigner"
                                    ? "Người giao việc"
                                    : "Người thực hiện"}
                              </em>
                            </span>
                            <small>{new Date(comment.created_at).toLocaleString("vi-VN")}</small>
                          </header>
                          {editingComment?.id === comment.id ? (
                            <form className="comment-edit-form" onSubmit={saveComment}>
                              <textarea name="content" required defaultValue={comment.content} rows="3" autoFocus />
                              <div>
                                <button type="button" className="secondary-btn" onClick={() => setEditingComment(null)}>
                                  Hủy
                                </button>
                                <button className="primary-btn">Lưu nhận xét</button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <p>{comment.content}</p>
                              {comment.can_edit && (
                                <button className="edit-comment-btn" onClick={() => setEditingComment(comment)}>
                                  <Pencil size={14} /> Chỉnh sửa
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <CommentComposer task={viewing} saving={workflowSaving} onComment={postComment} onDraftChange={setCommentDraft} />
              </section>
            </div>
            {viewing.can_cancel && (
              <footer className="task-drawer-foot">
                <button type="button" className="danger-link" disabled={workflowSaving} onClick={cancelTask}>
                  <Trash2 size={15} /> Hủy công việc
                </button>
              </footer>
            )}
          </aside>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <span>
              <Trash2 size={24} />
            </span>
            <h3>Xóa công việc?</h3>
            <p>
              Bạn có chắc muốn xóa <b>{deleting.code}</b>? Công việc sẽ được lưu
              trong dữ liệu đã xóa.
            </p>
            <div>
              <button
                className="secondary-btn"
                onClick={() => setDeleting(null)}
              >
                Hủy
              </button>
              <button className="danger-btn" onClick={remove}>
                Xóa công việc
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompactAssignees({ editing, refs, toggle }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const teachers = refs.teachers.filter((item) => editing.teacher_ids.includes(item.id));
  const departments = refs.departments.filter((item) => editing.department_ids.includes(item.id));
  return (
    <div className="compact-assignees" ref={ref}>
      <div className="assignee-chip-list">
        <button type="button" className="add-assignee" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Plus size={16} /> Chọn tổ / nhóm / cá nhân
        </button>
        {departments.map((item) => (
          <button type="button" className="assignee-chip department" key={`d-${item.id}`} onClick={() => toggle("department_ids", item.id)} title={`${item.name} — bấm để bỏ chọn`}>
            <Users size={14} />
            {item.short_name || item.name}
            <X size={12} />
          </button>
        ))}
        {teachers.map((item) => (
          <button type="button" className="assignee-chip" key={`t-${item.id}`} onClick={() => toggle("teacher_ids", item.id)} title="Bấm để bỏ chọn">
            {item.avatar_url ? <img src={item.avatar_url} alt={`Ảnh của ${item.name}`} /> : <i>{item.name.charAt(0)}</i>}
            {item.name}
            <X size={12} />
          </button>
        ))}
      </div>
      {open && (
        <PeoplePicker
          title="Chọn người thực hiện"
          anchorRef={ref}
          people={refs.teachers}
          units={refs.departments}
          selectedPeople={editing.teacher_ids}
          selectedUnits={editing.department_ids}
          onTogglePerson={(id) => toggle("teacher_ids", id)}
          onToggleUnit={(id) => toggle("department_ids", id)}
        />
      )}
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder = "Mô tả nội dung cần thực hiện..." }) {
  const editorRef = useRef(null);
  useEffect(() => {
    if (
      editorRef.current &&
      document.activeElement !== editorRef.current &&
      editorRef.current.innerHTML !== value
    )
      editorRef.current.innerHTML = value;
  }, [value]);
  const format = (command, argument = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    onChange(editorRef.current?.innerHTML || "");
  };
  const addLink = () => {
    const url = window.prompt("Nhập đường dẫn liên kết:", "https://");
    if (url) format("createLink", url);
  };
  const buttons = [
    ["Hoàn tác", Undo2, () => format("undo")],
    ["Làm lại", Redo2, () => format("redo")],
    ["Tiêu đề 1", null, () => format("formatBlock", "h1"), "H1"],
    ["Tiêu đề 2", null, () => format("formatBlock", "h2"), "H2"],
    ["In đậm", Bold, () => format("bold")],
    ["In nghiêng", Italic, () => format("italic")],
    ["Gạch ngang", Strikethrough, () => format("strikeThrough")],
    ["Đoạn mã", Code2, () => format("formatBlock", "pre")],
    ["Trích dẫn", Quote, () => format("formatBlock", "blockquote")],
    ["Danh sách số", ListOrdered, () => format("insertOrderedList")],
    ["Danh sách chấm", List, () => format("insertUnorderedList")],
    ["Chèn liên kết", Link2, addLink],
  ];
  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        {buttons.map(([title, Icon, action, text], index) => (
          <button
            type="button"
            title={title}
            aria-label={title}
            onClick={action}
            key={title}
            className={[1, 3, 6, 8, 10].includes(index) ? "with-divider" : ""}
          >
            {Icon ? <Icon size={16} /> : text}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className="rich-content"
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        data-placeholder={placeholder}
      />
    </div>
  );
}

function ReviewerPicker({ reviewers, units, value, onChange }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const selected = value.map((id) => reviewers.find((item) => item.id === id)).filter(Boolean);
  const toggle = (id) => onChange((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  return (
    <div className="reviewer-picker wide" ref={ref}>
      <b>
        Người duyệt
      </b>
      {selected.map((item) => (
        <input key={item.id} type="hidden" name="reviewer_ids[]" value={item.id} />
      ))}
      <div className="assignee-chip-list">
        <button type="button" className="add-assignee" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Plus size={16} /> {selected.length ? "Thêm / bớt người duyệt" : "Chọn người duyệt"}
        </button>
        {selected.map((item) => (
          <button type="button" className="assignee-chip" key={item.id} onClick={() => toggle(item.id)} title="Bấm để bỏ chọn">
            {item.avatar_url ? <img src={item.avatar_url} alt={`Ảnh của ${item.name}`} /> : <i>{item.name.charAt(0)}</i>}
            {item.name}
            {roleChips(item, null, units).slice(0, 1).map((chip) => (
              <small key={chip.label}>{chip.label}</small>
            ))}
            <X size={12} />
          </button>
        ))}
      </div>
      {open && (
        <PeoplePicker title="Chọn người duyệt" anchorRef={ref} people={reviewers} units={units} selectedPeople={value} onTogglePerson={toggle} />
      )}
    </div>
  );
}

function FileAttachmentPicker({ editing, setEditing }) {
  const inputRef = useRef(null);
  const addFiles = (fileList) => {
    const incoming = [...fileList].filter(
      (file) => file.size <= 20 * 1024 * 1024,
    );
    setEditing((current) => ({
      ...current,
      pending_files: [...(current.pending_files || []), ...incoming].filter(
        (file, index, list) =>
          list.findIndex(
            (item) => item.name === file.name && item.size === file.size,
          ) === index,
      ),
    }));
  };
  const removeNew = (index) =>
    setEditing((current) => ({
      ...current,
      pending_files: (current.pending_files || []).filter(
        (_, fileIndex) => fileIndex !== index,
      ),
    }));
  const removeExisting = (id) =>
    setEditing((current) => ({
      ...current,
      removed_attachment_ids: [...(current.removed_attachment_ids || []), id],
    }));
  const existing = (editing.attachments || []).filter(
    (file) => !(editing.removed_attachment_ids || []).includes(file.id),
  );
  return (
    <div className="attachment-picker">
      <button
        type="button"
        className="attachment-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        <span>
          <Plus size={22} />
        </span>
        <b>Chọn hoặc kéo thả file vào đây</b>
        <small>PDF, Word, Excel, hình ảnh hoặc ZIP · Tối đa 20MB/file</small>
      </button>
      <input
        ref={inputRef}
        hidden
        multiple
        type="file"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="attachment-list">
        {existing.map((file) => (
          <article key={`old-${file.id}`}>
            <i>
              <FileText size={17} />
            </i>
            <div>
              <b>{file.original_name}</b>
              <small>{formatFileSize(file.size)} · Đã tải lên</small>
            </div>
            <button
              type="button"
              title="Xóa file"
              onClick={() => removeExisting(file.id)}
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
        {(editing.pending_files || []).map((file, index) => (
          <article key={`new-${file.name}-${file.size}`}>
            <i>
              <Paperclip size={17} />
            </i>
            <div>
              <b>{file.name}</b>
              <small>{formatFileSize(file.size)} · File mới</small>
            </div>
            <button
              type="button"
              title="Xóa file"
              onClick={() => removeNew(index)}
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function humanSpan(ms) {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60000));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

function formatMoment(value) {
  return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function TaskTimeline({ task }) {
  const start = task.starts_at || task.created_at;
  const due = task.due_at ? new Date(task.due_at).getTime() : null;
  const now = Date.now();
  let tone = "neutral";
  let label = "Không thời hạn";
  if (task.status === "cancelled") {
    label = "Đã hủy";
  } else if (task.status === "completed") {
    tone = task.is_late ? "warn" : "good";
    label = task.is_late ? "Hoàn thành trễ hạn" : due ? "Hoàn thành đúng hạn" : "Đã hoàn thành";
  } else if (due) {
    const left = due - now;
    tone = left < 0 ? "alert" : left <= 24 * 3600 * 1000 ? "warn" : "good";
    label = left < 0 ? `Quá hạn ${humanSpan(left)}` : `Còn ${humanSpan(left)}`;
  }
  const startAt = start ? new Date(start).getTime() : null;
  const progress = task.status === "completed" ? 100 : due && startAt && due > startAt ? Math.min(100, Math.max(0, ((now - startAt) / (due - startAt)) * 100)) : null;
  return (
    <section className={`task-timeline ${tone}`}>
      <div className="task-timeline-top">
        <div>
          <span>Bắt đầu</span>
          <b>{start ? formatMoment(start) : "—"}</b>
        </div>
        <em>
          <CalendarClock size={14} /> {label}
        </em>
        <div className="end">
          <span>Hạn hoàn thành</span>
          <b>{task.due_at ? formatMoment(task.due_at) : "Không thời hạn"}</b>
        </div>
      </div>
      {progress !== null && task.status !== "cancelled" && (
        <div className="task-timeline-track">
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
      {task.status === "completed" && task.completed_at && (
        <p className="task-timeline-done">
          <CheckCircle2 size={14} />
          {task.finished_at && Math.abs(new Date(task.completed_at) - new Date(task.finished_at)) > 60000 ? (
            <>
              Nộp lúc <b>{formatMoment(task.finished_at)}</b> · Duyệt lúc <b>{formatMoment(task.completed_at)}</b>
            </>
          ) : (
            <>
              Hoàn thành lúc <b>{formatMoment(task.completed_at)}</b>
            </>
          )}
        </p>
      )}
    </section>
  );
}

const avatarTones = ["#7b68df", "#2f7fe0", "#17a871", "#e0862f", "#d14d72", "#4b9aa8"];

function PersonAvatar({ person, size = 32 }) {
  return person.avatar_url ? (
    <img className="person-avatar" src={person.avatar_url} alt="" style={{ width: size, height: size }} />
  ) : (
    <i className="person-avatar" style={{ width: size, height: size, background: avatarTones[(person.id || 0) % avatarTones.length] }}>
      {person.name?.split(" ").at(-1)?.charAt(0)}
    </i>
  );
}

function PersonCards({ people, empty }) {
  if (!people.length) return <span className="person-empty">{empty}</span>;
  return (
    <div className="person-cards">
      {people.map((person) => (
        <div className="person-card" key={person.id}>
          <PersonAvatar person={person} />
          <div>
            <b>{person.name}</b>
            {person.role && <small>{person.role}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

function taskFormSnapshot(element, editing) {
  if (!element || !editing) return null;
  const values = [...new FormData(element).entries()].filter(([key, value]) => typeof value === "string" && !["description", "reviewer_ids", "teacher_ids", "department_ids", "document_ids"].includes(key.replace(/\[\]$/, "")));
  return JSON.stringify([
    values,
    editing.description || "",
    editing.reviewer_ids || [],
    editing.assignment_mode,
    editing.teacher_ids,
    editing.department_ids,
    editing.document_ids,
    editing.pending_files?.length || 0,
    editing.removed_attachment_ids?.length || 0,
  ]);
}

function TaskStatusBadges({ task }) {
  return (
    <div className="task-status-badges">
      <span className={`task-status ${task.status}`}>{labels.status[task.status]}</span>
      {task.needs_revision && <span className="task-flag revision">Cần chỉnh sửa</span>}
      {task.is_overdue && <span className="task-flag overdue">Quá hạn</span>}
      {task.is_late && <span className="task-flag late">Hoàn thành trễ</span>}
    </div>
  );
}

function useDraftTracker(resetKeys, onDraftChange) {
  const [drafts, setDrafts] = useState({});
  useEffect(() => setDrafts({}), resetKeys); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onDraftChange?.(Object.values(drafts).some(Boolean)), [drafts, onDraftChange]);
  const track = (name) => ({
    onInput: (event) => {
      const filled = [...event.currentTarget.elements].some((el) => (el.type === "file" ? el.files?.length > 0 : el.tagName === "TEXTAREA" && el.value.trim() !== ""));
      setDrafts((current) => ({ ...current, [name]: filled }));
    },
    onChange: (event) => {
      const filled = [...event.currentTarget.elements].some((el) => (el.type === "file" ? el.files?.length > 0 : el.tagName === "TEXTAREA" && el.value.trim() !== ""));
      setDrafts((current) => ({ ...current, [name]: filled }));
    },
    onReset: () => setDrafts((current) => ({ ...current, [name]: false })),
  });
  return [drafts, track];
}

function TaskWorkflowPanel({ task, saving, error, onStart, onSubmit, onReview, onSelfComplete, onDraftChange }) {
  const [, track] = useDraftTracker([task.id, task.status, task.submission_count], onDraftChange);
  const [submitOpen, setSubmitOpen] = useState(false);
  useEffect(() => setSubmitOpen(false), [task.id, task.status]);
  const latest = task.latest_submission;
  const hasAction = task.can_update_progress || task.can_submit_completion || task.can_review_completion || task.can_self_complete;
  const waiting = task.status === "waiting_approval" && !task.can_review_completion;
  if (!hasAction && !waiting && !task.needs_revision && !error) return null;
  return (
    <section className="drawer-actions">
      {error && (
        <div className="workflow-inline-error">
          <TriangleAlert size={17} />
          {error}
        </div>
      )}
      {task.needs_revision && latest?.review_comment && (
        <div className="workflow-note revision">
          <RotateCcw size={15} />
          <span>
            <b>Yêu cầu chỉnh sửa:</b> {latest.review_comment}
          </span>
        </div>
      )}
      {waiting && (
        <div className="workflow-note">
          <Clock3 size={15} />
          <span>Đang chờ {task.reviewers?.length ? task.reviewers.map((r) => r.name).join(" hoặc ") : task.creator || "người duyệt"} xác nhận.</span>
        </div>
      )}
      {task.can_review_completion && (
        <form className="workflow-form" onSubmit={onReview} {...track("review")}>
          <textarea name="comment" rows="2" disabled={saving} placeholder="Nhận xét gửi người thực hiện (không bắt buộc)..." />
          <div className="drawer-action-row">
            <button name="decision" value="approved" className="approve-completion" disabled={saving}>
              <CheckCircle2 size={16} /> Xác nhận hoàn thành
            </button>
            <button name="decision" value="revision_required" className="revision-completion" disabled={saving}>
              <RotateCcw size={16} /> Yêu cầu chỉnh sửa
            </button>
          </div>
        </form>
      )}
      {(task.can_update_progress && task.status === "not_started") || task.can_submit_completion || task.can_self_complete ? (
        <div className="drawer-action-row">
          {task.can_update_progress && task.status === "not_started" && (
            <button type="button" className="secondary-btn" disabled={saving} onClick={onStart}>
              <Activity size={15} /> Bắt đầu thực hiện
            </button>
          )}
          {task.can_submit_completion && !submitOpen && (
            <button type="button" className="primary-btn" disabled={saving} onClick={() => setSubmitOpen(true)}>
              <Send size={15} /> Nộp kết quả
            </button>
          )}
          {task.can_self_complete && (
            <button type="button" className="approve-completion" disabled={saving} onClick={onSelfComplete}>
              <CheckCircle2 size={16} /> Đánh dấu hoàn thành
            </button>
          )}
        </div>
      ) : null}
      {task.can_submit_completion && submitOpen && (
        <form className="workflow-form submit-form" onSubmit={onSubmit} {...track("submit")}>
          <label>
            File kết quả
            <input
              name="submission_files[]"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.zip,.rar"
              disabled={saving}
            />
          </label>
          <label>
            Đường link (mỗi dòng một link)
            <textarea name="submission_links" rows="2" disabled={saving} placeholder="https://drive.google.com/..." />
          </label>
          <label>
            Ghi chú
            <textarea name="comment" rows="2" disabled={saving} placeholder="Mô tả kết quả đã làm..." />
          </label>
          <div className="drawer-action-row end">
            <button type="button" className="secondary-btn" disabled={saving} onClick={() => setSubmitOpen(false)}>
              Hủy
            </button>
            <button className="primary-btn" disabled={saving}>
              <Send size={15} /> Gửi đề nghị duyệt
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function CommentComposer({ task, saving, onComment, onDraftChange }) {
  const [drafts, track] = useDraftTracker([task.id], onDraftChange);
  return (
    <form className="comment-composer" onSubmit={onComment} {...track("comment")}>
      <textarea name="content" rows="2" disabled={saving} placeholder="Viết trao đổi tới những người liên quan..." />
      <button className="primary-btn" disabled={saving || !drafts.comment} title="Gửi trao đổi">
        <Send size={15} />
      </button>
    </form>
  );
}
