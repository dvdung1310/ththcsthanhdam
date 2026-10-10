import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  ClipboardCheck,
  Clock3,
  Eye,
  Download,
  FileText,
  FolderInput,
  Filter,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
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
  MessageSquare,
  X,
  Sparkles,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
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
import "./TaskDrawerLayout.css";
import "./TaskAiWorkspace.css";
import { apiFetch, apiJson } from "./api";
import { PageButtons } from "./TablePagination";
import { uploadProblem } from "./uploadLimits";
import { ColumnPicker, NameStack, useScrollEdges, useTaskColumns } from "./TaskTable";
import PeoplePicker, { roleChips, useOutsideClose } from "./PeoplePicker";
import ShareFileDialog from "./ShareFileDialog";
import { downloadFile, formatBytes } from "./fileUtils";
import FilePreview from "./FilePreview";
import ActionMenu from "./ActionMenu";
import { useConfirm } from "./ConfirmDialog";
import Avatar from "./Avatar";
import TitleInput from "./TitleInput";
import TaskDocuments from "./TaskDocuments";

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
const COMPOSE_MODE_KEY = "thanhdam_task_compose_mode";
const CHAT_COLLAPSED_KEY = "thanhdam_task_chat_collapsed";
const CHAT_SEEN_KEY = "thanhdam_task_chat_seen";

const emptyTask = {
  title: "",
  description: "",
  category_id: "",
  priority: "normal",
  share_submissions: true,
  starts_at: new Date().toISOString().slice(0, 16),
  due_at: "",
  reviewer_ids: [],
  employee_ids: [],
  department_ids: [],
  library_file_ids: [],
  library_files: [],
  attachments: [],
  pending_files: [],
  removed_attachment_ids: [],
  assignment_mode: "assign",
};

export default function TaskManagement({ canAssign, canUpdate, canAi = false, selectedTask, routeTaskCode = null, onRouteTaskChange }) {
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const [draftCount, setDraftCount] = useState(0);
  useEffect(() => {
    if (!canAi) return;
    apiJson("/api/task-drafts")
      .then((result) => setDraftCount(result.data.reduce((sum, batch) => sum + batch.drafts.length, 0)))
      .catch(() => {});
  }, [canAi]);
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
      employees: [],
      departments: [],
      reviewers: [],
      current_employee: null,
    }),
    [filters, setFilters] = useState(emptyActionFilters),
    [page, setPage] = useState(1),
    [perPage, setPerPage] = useState(10);
  const scrollEdges = useScrollEdges([tasks, columnState.hidden]);
  const currentUserId = refs.current_user_id;
  const formRef = useRef(null);
  const [formBaseline, setFormBaseline] = useState(null);
  const [, setFormTick] = useState(0);
  const [viewDraft, setViewDraft] = useState(false);
  const [submitDraft, setSubmitDraft] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [drawerTab, setDrawerTab] = useState("overview");
  const [chatCollapsed, setChatCollapsed] = useState(() => localStorage.getItem(CHAT_COLLAPSED_KEY) !== "0");
  const toggleChat = () =>
    setChatCollapsed((current) => {
      localStorage.setItem(CHAT_COLLAPSED_KEY, current ? "0" : "1");
      return !current;
    });
  const [commentDraft, setCommentDraft] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [editing, setEditing] = useState(null),
    [viewing, setViewing] = useState(null),
    [sharingFile, setSharingFile] = useState(null),
    [preview, setPreview] = useState(null),
    [workflowSaving, setWorkflowSaving] = useState(false),
    [workflowError, setWorkflowError] = useState(""),
    [editingComment, setEditingComment] = useState(null),
    [deleting, setDeleting] = useState(null),
    [highlightedTaskId, setHighlightedTaskId] = useState(null),
    [routeError, setRouteError] = useState(""),
    [reminding, setReminding] = useState(""),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
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
    const draft = location.state?.draftForm;
    if (!draft || !refs.categories.length) return;
    navigate(location.pathname, { replace: true, state: null });
    setEditing({
      ...emptyTask,
      ...draft,
      category_id: draft.category_id ?? "",
      starts_at: draft.starts_at ?? emptyTask.starts_at,
      due_at: draft.due_at ?? "",
      assignment_mode: "assign",
      library_file_ids: (draft.library_files || []).map((file) => file.id),
      library_files: draft.library_files || [],
      attachments: [],
      pending_files: [],
      removed_attachment_ids: [],
    });
  }, [location.state, refs.categories.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(t);
  }, [success]);
  const reset = () => {
      setFilters({ ...emptyActionFilters });
      setPage(1);
    },
    openCreate = () => {
      const employeeId = refs.current_employee?.id;
      const canSelf = canUpdate && Boolean(employeeId);
      const remembered = localStorage.getItem(COMPOSE_MODE_KEY);
      const assignmentMode = !canAssign ? "self" : !canSelf ? "assign" : remembered === "self" ? "self" : "assign";
      setEditing({
        ...emptyTask,
        assignment_mode: assignmentMode,
        employee_ids: assignmentMode === "self" && employeeId ? [employeeId] : [],
      });
    };
  const switchMode = async (mode) => {
    if (mode === editing.assignment_mode) return;
    const picked = editing.employee_ids.length + editing.department_ids.length;
    if (
      mode === "self" &&
      picked &&
      !(await confirm({
        tone: "warning",
        title: "Chuyển sang tự giao cho mình?",
        message: "Những người thực hiện bạn đã chọn sẽ bị bỏ.",
        confirmText: "Chuyển",
      }))
    )
      return;
    localStorage.setItem(COMPOSE_MODE_KEY, mode);
    setEditing((current) => ({
      ...current,
      assignment_mode: mode,
      employee_ids: mode === "self" ? [refs.current_employee.id] : [],
      department_ids: [],
    }));
  };
  const startEdit = async (task) => {
    if (viewing?.id !== task.id) await show(task);
    await openEdit(task);
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
    const formElement = e.currentTarget;
    setSaving(true);
    setFormError("");
    try {
      const problem = await uploadProblem(editing.pending_files || []);
      if (problem) {
        setFormError(problem);
        return;
      }
      const f = new FormData(formElement);
      f.delete("employee_ids");
      f.delete("department_ids");
      f.delete("library_file_ids");
      f.delete("attachments");
      editing.employee_ids.forEach((id) => f.append("employee_ids[]", id));
      editing.department_ids.forEach((id) => f.append("department_ids[]", id));
      editing.library_file_ids.forEach((id) => f.append("library_file_ids[]", id));
      editing.pending_files?.forEach((file) => f.append("attachments[]", file));
      editing.removed_attachment_ids?.forEach((id) =>
        f.append("remove_attachment_ids[]", id),
      );
      if (editing.draft_id && !editing.id) f.append("draft_id", editing.draft_id);
      if (editing.id) f.append("_method", "PUT");
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
        d = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(Object.values(d.errors ?? {}).flat()[0] ?? d.message ?? "Không thể lưu công việc. Vui lòng thử lại.");
      const savedId = editing.id;
      if (editing.draft_id && !savedId) setDraftCount((count) => Math.max(0, count - 1));
      setEditing(null);
      setSuccess(d.message);
      if (savedId && viewing?.id === savedId) await show(viewing);
      await loadTasks();
    } catch (x) {
      setFormError(x.message);
    } finally {
      setSaving(false);
    }
  };
  const show = async (task, { fromRoute = false } = {}) => {
    try {
      const r = await apiFetch(`/api/tasks/${task.id}`, {
          headers: { Accept: "application/json" },
        }),
        d = await r.json();
      if (!r.ok) throw new Error(r.status === 404 ? "Không tìm thấy công việc này. Có thể công việc đã bị xóa." : r.status === 403 ? "Bạn không có quyền xem công việc này." : d.message || "Không mở được công việc này.");
      setViewing(d.data);
      setWorkflowError("");
      setRouteError("");
      if (fromRoute) setHighlightedTaskId(d.data.id);
      if (routeTaskCode !== d.data.code) onRouteTaskChange?.(d.data.code, { replace: fromRoute });
    } catch (e) {
      if (fromRoute) {
        setRouteError(e.message);
        onRouteTaskChange?.(null, { replace: true });
      } else setError(e.message);
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
  const openPreview = (list, index) => setPreview({ files: list, index });
  const saveComment = async (event) => {
    event.preventDefault();
    const content = new FormData(event.currentTarget).get("content");
    try {
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        return setError(
          Object.values(payload.errors || {}).flat()[0] || payload.message || "Không thể lưu trao đổi.",
        );
      setEditingComment(null);
      setSuccess(payload.message);
      await show(viewing);
    } catch (e) {
      setError(e.message || "Không thể lưu trao đổi.");
    }
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
  const submissionForm = async (formElement) => {
    const form = new FormData(formElement);
    const problem = await uploadProblem(form.getAll("submission_files[]").filter((file) => file.size));
    if (problem) {
      setError(problem);
      return null;
    }
    const links = String(form.get("submission_links") || "");
    form.delete("submission_links");
    links
      .split(/\r?\n/)
      .map((link) => link.trim())
      .filter(Boolean)
      .forEach((link) => form.append("links[]", link));
    return form;
  };
  const submitCompletion = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = await submissionForm(formElement);
    if (form && (await runWorkflow("submit-completion", { body: form }, "Không thể gửi đề nghị hoàn thành.")))
      formElement.reset();
  };
  const updateSubmission = async (event) => {
    event.preventDefault();
    const form = await submissionForm(event.currentTarget);
    if (form && (await runWorkflow(`submissions/${editingSubmission}`, { body: form }, "Không thể cập nhật bài nộp.")))
      setEditingSubmission(null);
  };
  const reviewCompletion = async (event) => {
    event.preventDefault();
    const decision = event.nativeEvent.submitter?.value;
    const comment = new FormData(event.currentTarget).get("comment");
    await runWorkflow("review-completion", { json: { decision, comment } }, "Không thể duyệt công việc.");
  };
  const toggleSharing = async (share) => {
    if (
      share &&
      !(await confirm({
        title: "Cho người thực hiện xem bài nộp của nhau?",
        message: "Toàn bộ bài nộp đã có, kể cả nhận xét của người duyệt, sẽ hiện cho mọi người thực hiện công việc này.",
        confirmText: "Bật chia sẻ",
      }))
    )
      return;
    await runWorkflow("submission-sharing", { json: { share_submissions: share } }, "Không thể đổi cài đặt bài nộp.");
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
    if (!editing) setFormError("");
  }, [editing]);
  useEffect(() => {
    if (editing && formBaseline === null && formRef.current) setFormBaseline(taskFormSnapshot(formRef.current, editing));
    if (!editing && formBaseline !== null) setFormBaseline(null);
  }, [editing, formBaseline]);
  useEffect(() => {
    if (editing) setShowSupport((editing.library_file_ids?.length || 0) + (editing.attachments?.length || 0) > 0);
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const inlineEdit = Boolean(editing?.id && viewing?.id === editing.id);
  const formDirty = formBaseline !== null && taskFormSnapshot(formRef.current, editing) !== formBaseline;
  const toggleLibraryFile = (file) =>
    setEditing((current) => {
      const picked = current.library_file_ids.includes(file.id);
      return {
        ...current,
        library_file_ids: picked ? current.library_file_ids.filter((id) => id !== file.id) : [...current.library_file_ids, file.id],
        library_files: picked || (current.library_files || []).some((item) => item.id === file.id) ? current.library_files : [...(current.library_files || []), file],
      };
    });
  const attachmentCount = editing
    ? editing.library_file_ids.length + (editing.pending_files?.length || 0) + (editing.attachments?.length || 0) - (editing.removed_attachment_ids?.length || 0)
    : 0;
  const formMissing = editing
    ? [
        !formRef.current?.elements.title?.value.trim() && "tên công việc",
        editing.assignment_mode !== "self" && !editing.employee_ids.length && !editing.department_ids.length && "người thực hiện",
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
    if (inlineEdit && formDirty && !(await discardChanges("Nội dung bạn vừa sửa cho công việc này sẽ không được lưu."))) return false;
    if ((viewDraft || submitDraft || commentDraft || editingSubmission) && !(await discardChanges("Kết quả, nhận xét hoặc trao đổi bạn đang nhập sẽ không được gửi."))) return false;
    if (inlineEdit) setEditing(null);
    setViewDraft(false);
    setSubmitDraft(false);
    setEditingSubmission(null);
    setDrawerTab("overview");
    setCommentDraft(false);
    setViewing(null);
    return true;
  };
  const closeView = async () => {
    const closed = await requestCloseView();
    if (closed) onRouteTaskChange?.(null);
    return closed;
  };
  useEffect(() => {
    if (routeTaskCode) {
      if (viewing?.code.toLowerCase() !== routeTaskCode.toLowerCase()) show({ id: routeTaskCode }, { fromRoute: true });
    } else if (viewing) {
      requestCloseView().then((closed) => !closed && onRouteTaskChange?.(viewing.code, { replace: true }));
    }
  }, [routeTaskCode]);
  const toggle = (field, id) =>
    setEditing((c) => {
      const adding = !c[field].includes(id);
      const reviewer = field === "employee_ids" && adding ? refs.reviewers.find((r) => r.employee_id === id) : null;
      return {
        ...c,
        [field]: adding ? [...c[field], id] : c[field].filter((x) => x !== id),
        ...(reviewer ? { reviewer_ids: (c.reviewer_ids || []).filter((x) => x !== reviewer.id) } : {}),
      };
    });
  const taskForm = editing ? (
    <form ref={formRef} className="task-form-pane" onSubmit={save} onInput={() => setFormTick((tick) => tick + 1)} onChange={() => setFormTick((tick) => tick + 1)}>
      <div className="task-form-scroll task-compose-body">
        {!editing.id && canAssign && canUpdate && refs.current_employee && (
          <div className="assignment-mode-picker" role="group" aria-label="Cách phân công">
            <button
              type="button"
              className={editing.assignment_mode === "assign" ? "active" : ""}
              onClick={() => switchMode("assign")}
            >
              <Users size={15} /> Giao cho người khác
            </button>
            <button
              type="button"
              className={editing.assignment_mode === "self" ? "active" : ""}
              onClick={() => switchMode("self")}
            >
              <UserRoundCheck size={15} /> Tự giao cho mình
            </button>
          </div>
        )}
        <section className="form-block">
          <label className="field">
            <span className="field-label">
              Tên công việc <span className="required-mark">*</span>
            </span>
            <TitleInput
              className="task-title-field"
              name="title"
              required
              defaultValue={editing.title}
              placeholder="Nhập tên công việc..."
            />
          </label>
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
              Tài liệu
              {attachmentCount > 0 && <em>{attachmentCount}</em>}
            </span>
            <ChevronDown size={16} className={showSupport ? "open" : ""} />
          </button>
          {showSupport && (
            <div className="block-body">
              {canAi && !editing.id && editing.assignment_mode !== "self" && !editing.draft_id && (
                <button
                  type="button"
                  className="ai-shortcut"
                  onClick={async () => {
                    if (formDirty && !(await confirm({ tone: "warning", title: "Rời form tạo công việc?", message: "Nội dung đang nhập trong form sẽ không được lưu.", confirmText: "Tiếp tục" }))) return;
                    setEditing(null);
                    navigate("/tasks/ai", { state: { nodes: (editing.library_files || []).filter((file) => editing.library_file_ids.includes(file.id)) } });
                  }}
                >
                  <Sparkles size={15} /> Phân tích tài liệu & gợi ý công việc <small>— AI đọc văn bản và tạo các bản nháp công việc</small>
                </button>
              )}
              <TaskDocuments
                editing={editing}
                setEditing={setEditing}
                canBrowseLibrary={refs.can_browse_library}
                onToggleLibrary={toggleLibraryFile}
              />
            </div>
          )}
        </section>
        <section
          className={`form-block ${editing.assignment_mode === "self" ? "personal-assignment" : ""}`}
        >
          <h4>Phân công</h4>
          {editing.assignment_mode === "self" && !editing.id ? (
            <div className="personal-assignee-card">
              {refs.current_employee?.avatar_url ? (
                <img
                  src={refs.current_employee.avatar_url}
                  alt="Ảnh đại diện"
                />
              ) : (
                <Avatar name={refs.current_employee?.name} size={34} />
              )}
              <div>
                <b>{refs.current_employee?.name}</b>
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
            reviewers={refs.reviewers.filter((r) => editing.assignment_mode === "self" ? r.id !== refs.current_employee?.user_id : !editing.employee_ids.includes(r.employee_id))}
            units={refs.units || []}
            value={editing.reviewer_ids || []}
            onChange={(update) =>
              setEditing((c) => ({ ...c, reviewer_ids: update(c.reviewer_ids || []) }))
            }
          />
        </section>
        <section className="form-block">
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
        {editing.assignment_mode !== "self" && (
          <details className="task-form-more" open={editing.share_submissions === false}>
            <summary>Tùy chọn khác</summary>
            <label className="share-switch form">
              <input type="hidden" name="share_submissions" value="0" />
              <input type="checkbox" name="share_submissions" value="1" defaultChecked={editing.share_submissions ?? true} />
              <i />
              <span>
                <b>Người thực hiện được xem bài nộp của nhau</b>
                <small>Tắt để mỗi người chỉ thấy bài của mình. Người duyệt và người giao vẫn xem được tất cả.</small>
              </span>
            </label>
          </details>
        )}
      </div>
      <div className="task-form-foot">
        {formError && (
          <div className="task-form-error" role="alert">
            <TriangleAlert size={15} />
            <span>{formError}</span>
            <button type="button" onClick={() => setFormError("")} aria-label="Đóng">
              <X size={15} />
            </button>
          </div>
        )}
        <div className="task-form-actions">
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
      </div>
    </form>
  ) : null;
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
            {canAi && (
              <button className="secondary-btn" onClick={() => navigate("/tasks/ai")} title="AI đọc công văn, kế hoạch và gợi ý các công việc cần giao">
                <Sparkles size={16} /> Tạo từ tài liệu
                {draftCount > 0 && <em className="ai-create-badge" title={`${draftCount} bản nháp đang chờ`}>{draftCount}</em>}
              </button>
            )}
            {(canAssign || (canUpdate && refs.current_employee)) && (
              <button className="primary-btn" onClick={openCreate}>
                <Plus size={17} /> Tạo công việc
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
        {routeError && (
          <div className="api-error">
            <TriangleAlert size={16} />
            {routeError}
            <button onClick={() => setRouteError("")}>Đóng</button>
          </div>
        )}
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
                          <button title="Sửa" onClick={() => startEdit(t)}>
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
            <PageButtons page={page} totalPages={meta.last_page} onPage={setPage} />
            <button
              disabled={page === meta.last_page}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      {editing && !editing.id && (
        <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && requestCloseEdit()}>
          <aside className="task-drawer compose" role="dialog" aria-modal="true" aria-label="Tạo công việc">
            <header className="task-drawer-head">
              <div>
                <h2>Tạo công việc</h2>
                <p className="task-drawer-sub">Thông tin rõ ràng giúp người thực hiện hoàn thành đúng yêu cầu</p>
              </div>
              <div className="task-drawer-head-actions">
                <button type="button" title="Đóng" onClick={requestCloseEdit}>
                  <X size={19} />
                </button>
              </div>
            </header>
            {taskForm}
          </aside>
        </div>
      )}
      {viewing && (
        <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeView()}>
          <aside className={`task-drawer split ${chatCollapsed ? "chat-collapsed" : ""} ${inlineEdit ? "editing" : ""}`} data-tab={drawerTab} role="dialog" aria-modal="true" aria-label={`Chi tiết ${viewing.code}`}>
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
                  {inlineEdit && <span className="task-drawer-editing">Đang sửa</span>}
                </div>
                <h2>{viewing.title}</h2>
              </div>
              <div className="task-drawer-head-actions">
                {(viewing.can_manage || viewing.can_edit_personal) && !inlineEdit && (
                  <button type="button" title="Sửa" onClick={() => openEdit(viewing)}>
                    <Pencil size={17} />
                  </button>
                )}
                <button type="button" title="Đóng" onClick={closeView}>
                  <X size={19} />
                </button>
              </div>
            </header>
            <nav className="task-drawer-tabs" role="tablist">
              {[
                ["overview", "Tổng quan"],
                ["submissions", "Bài nộp", viewing.submissions?.length],
                ["chat", "Trao đổi", viewing.updates?.length],
              ].map(([key, label, count]) => (
                <button key={key} type="button" role="tab" aria-selected={drawerTab === key} className={drawerTab === key ? "active" : ""} onClick={() => setDrawerTab(key)}>
                  {label}
                  {!!count && <em>{count}</em>}
                </button>
              ))}
            </nav>
            <div className="task-drawer-split">
              {inlineEdit ? (
                taskForm
              ) : (
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
                {!!viewing.library_files?.length && (
                  <section className="drawer-section">
                    <h4>File từ Kho dữ liệu <em>{viewing.library_files.length}</em></h4>
                    <div className="drawer-files">
                      {viewing.library_files.map((file, index, all) => {
                        const url = file.download_url.replace(/^.*\/api\//, "/api/");
                        return (
                          <DrawerFile
                            key={file.id}
                            name={file.name}
                            size={file.size}
                            icon={FileText}
                            onOpen={() => openPreview(all.map((f) => ({ key: f.id, name: f.name, mime_type: f.mime_type, size: f.size, url: f.download_url.replace(/^.*\/api\//, "/api/") })), index)}
                            onDownload={() => downloadFile(url, file.name).catch((e) => setError(e.message))}
                          />
                        );
                      })}
                    </div>
                  </section>
                )}
                {!!viewing.attachments?.length && (
                  <section className="drawer-section">
                    <h4>File đính kèm <em>{viewing.attachments.length}</em></h4>
                    <div className="drawer-files">
                      {viewing.attachments.map((file, index, all) => {
                        const url = `/api/tasks/${viewing.id}/attachments/${file.id}`;
                        return (
                          <DrawerFile
                            key={file.id}
                            name={file.original_name}
                            size={file.size}
                            onOpen={() => openPreview(all.map((f) => ({ key: f.id, name: f.original_name, mime_type: f.mime_type, size: f.size, url: `/api/tasks/${viewing.id}/attachments/${f.id}` })), index)}
                            onDownload={() => downloadFile(url, file.original_name).catch((e) => setError(e.message))}
                          />
                        );
                      })}
                    </div>
                  </section>
                )}
                <SubmissionGroups
                  task={viewing}
                  saving={workflowSaving}
                  onToggleSharing={toggleSharing}
                  editingId={editingSubmission}
                  onEdit={setEditingSubmission}
                  onUpdate={updateSubmission}
                  onPreview={openPreview}
                  onDownload={(url, name) => downloadFile(url, name).catch((e) => setError(e.message))}
                  onShare={(file) => setSharingFile({ id: file.id, name: file.original_name })}
                />
                <TaskSubmitPanel task={viewing} saving={workflowSaving} onSubmit={submitCompletion} onDraftChange={setSubmitDraft} />
              </div>
              )}
              <TaskChat
                task={viewing}
                saving={workflowSaving}
                editingComment={editingComment}
                onEditComment={setEditingComment}
                onSaveComment={saveComment}
                onComment={postComment}
                onDraftChange={setCommentDraft}
                tab={drawerTab}
                collapsed={chatCollapsed}
                onToggle={toggleChat}
              />
            </div>
            {viewing.can_cancel && !inlineEdit && (
              <footer className="task-drawer-foot">
                <button type="button" className="danger-link" disabled={workflowSaving} onClick={cancelTask}>
                  <Trash2 size={15} /> Hủy công việc
                </button>
              </footer>
            )}
          </aside>
        </div>
      )}
      {preview && <FilePreview files={preview.files} startIndex={preview.index} onClose={() => setPreview(null)} />}
      {sharingFile && (
        <ShareFileDialog
          file={sharingFile}
          onClose={() => setSharingFile(null)}
          onDone={(message) => {
            setSharingFile(null);
            setSuccess(message);
          }}
        />
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

export function CompactAssignees({ editing, refs, toggle }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const employees = refs.employees.filter((item) => editing.employee_ids.includes(item.id));
  const departments = refs.departments.filter((item) => editing.department_ids.includes(item.id));
  return (
    <div className="compact-assignees" ref={ref}>
      <div className="assignee-chip-list">
        <button type="button" className="add-assignee" data-picker-trigger aria-expanded={open} onClick={() => setOpen(!open)}>
          <Plus size={16} /> Chọn tổ / nhóm / cá nhân
        </button>
        {departments.map((item) => (
          <button type="button" className="assignee-chip department" key={`d-${item.id}`} onClick={() => toggle("department_ids", item.id)} title={`${item.name} — bấm để bỏ chọn`}>
            <Users size={14} />
            {item.short_name || item.name}
            <X size={12} />
          </button>
        ))}
        {employees.map((item) => (
          <button type="button" className="assignee-chip" key={`t-${item.id}`} onClick={() => toggle("employee_ids", item.id)} title="Bấm để bỏ chọn">
            {item.avatar_url ? <img src={item.avatar_url} alt={`Ảnh của ${item.name}`} /> : <Avatar name={item.name} />}
            {item.name}
            <X size={12} />
          </button>
        ))}
      </div>
      {open && (
        <PeoplePicker
          title="Chọn người thực hiện"
          anchorRef={ref}
          onClose={close}
          people={refs.employees}
          units={refs.departments}
          selectedPeople={editing.employee_ids}
          selectedUnits={editing.department_ids}
          onTogglePerson={(id) => toggle("employee_ids", id)}
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

export function ReviewerPicker({ reviewers, units, value, onChange }) {
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
        <button type="button" className="add-assignee" data-picker-trigger aria-expanded={open} onClick={() => setOpen(!open)}>
          <Plus size={16} /> {selected.length ? "Thêm / bớt người duyệt" : "Chọn người duyệt"}
        </button>
        {selected.map((item) => (
          <button type="button" className="assignee-chip" key={item.id} onClick={() => toggle(item.id)} title="Bấm để bỏ chọn">
            {item.avatar_url ? <img src={item.avatar_url} alt={`Ảnh của ${item.name}`} /> : <Avatar name={item.name} />}
            {item.name}
            {roleChips(item, null, units).slice(0, 1).map((chip) => (
              <small key={chip.label}>{chip.label}</small>
            ))}
            <X size={12} />
          </button>
        ))}
      </div>
      {open && (
        <PeoplePicker title="Chọn người duyệt" anchorRef={ref} onClose={close} people={reviewers} units={units} selectedPeople={value} onTogglePerson={toggle} />
      )}
    </div>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DrawerFile({ name, size, note, icon: Icon = Paperclip, onOpen, onDownload, onShare }) {
  return (
    <div className="drawer-file">
      <button type="button" className="drawer-file-main" onClick={onOpen} title="Xem file">
        <i>
          <Icon size={16} />
        </i>
        <span>
          <b>{name}</b>
          <small>
            {formatFileSize(size)}
            {note && <em className="outside-shared"> · {note}</em>}
          </small>
        </span>
      </button>
      <ActionMenu
        items={[
          { key: "open", label: "Xem", icon: Eye, onClick: onOpen },
          { key: "download", label: "Tải về", icon: Download, onClick: onDownload },
          onShare && { key: "d", divider: true },
          onShare && { key: "share", label: "Chia sẻ vào kho", icon: FolderInput, onClick: onShare },
        ]}
      />
    </div>
  );
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

function PersonAvatar({ person, size = 32 }) {
  return person.avatar_url ? (
    <img className="person-avatar" src={person.avatar_url} alt="" style={{ width: size, height: size }} />
  ) : (
    <Avatar className="person-avatar" name={person.name} size={size} />
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
  const values = [...new FormData(element).entries()].filter(([key, value]) => typeof value === "string" && !["description", "reviewer_ids", "employee_ids", "department_ids", "library_file_ids"].includes(key.replace(/\[\]$/, "")));
  return JSON.stringify([
    values,
    editing.description || "",
    editing.reviewer_ids || [],
    editing.assignment_mode,
    editing.employee_ids,
    editing.department_ids,
    editing.library_file_ids,
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

function TaskWorkflowPanel({ task, saving, error, onStart, onReview, onSelfComplete, onDraftChange }) {
  const [, track] = useDraftTracker([task.id, task.status, task.submission_count], onDraftChange);
  const latest = task.latest_submission;
  const canStart = task.can_update_progress && task.status === "not_started";
  const revision = task.needs_revision && latest?.review_comment;
  const waiting = task.status === "waiting_approval" && !task.can_review_completion;
  if (!canStart && !task.can_review_completion && !task.can_self_complete && !waiting && !revision && !error) return null;
  return (
    <section className="drawer-actions">
      {error && (
        <div className="workflow-inline-error">
          <TriangleAlert size={17} />
          {error}
        </div>
      )}
      {revision && (
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
      {canStart || task.can_self_complete ? (
        <div className="drawer-action-row">
          {canStart && (
            <button type="button" className="secondary-btn" disabled={saving} onClick={onStart}>
              <Activity size={15} /> Bắt đầu thực hiện
            </button>
          )}
          {task.can_self_complete && (
            <button type="button" className="approve-completion" disabled={saving} onClick={onSelfComplete}>
              <CheckCircle2 size={16} /> Đánh dấu hoàn thành
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function TaskSubmitPanel({ task, saving, onSubmit, onDraftChange }) {
  const [, track] = useDraftTracker([task.id, task.status, task.submission_count], onDraftChange);
  if (!task.can_submit_completion) return null;
  return (
    <section className="drawer-actions drawer-submit">
      <SubmissionForm key={`${task.id}-${task.submission_count ?? 0}`} task={task} saving={saving} onSubmit={onSubmit} draft={track("submit")} />
    </section>
  );
}

const LINK_PATTERN = /^https?:\/\/\S+$/i;

function SubmissionForm({ task, submission, saving, onSubmit, onCancel, draft = {} }) {
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState(() => (submission?.links ?? []).join("\n"));
  const [comment, setComment] = useState(submission?.result_content ?? "");
  const [fileProblem, setFileProblem] = useState("");
  const [removed, setRemoved] = useState([]);
  const kept = (submission?.files ?? []).filter((file) => !removed.includes(file.id));

  const linkLines = links.split(/\r?\n/).map((line, index) => [line.trim(), index + 1]).filter(([line]) => line);
  const badLines = linkLines.filter(([line]) => !LINK_PATTERN.test(line)).map(([, number]) => number);
  const filled = files.length > 0 || kept.length > 0 || linkLines.length > 0 || comment.trim() !== "";
  const blocked = !filled
    ? "Cần ít nhất một: file, link hoặc ghi chú."
    : badLines.length
      ? "Sửa các link chưa hợp lệ trước khi nộp."
      : fileProblem;
  const recipients = task.reviewers?.length
    ? `người duyệt ${task.reviewers.map((reviewer) => reviewer.name).join(", ")}`
    : `người giao việc ${task.creator || ""}`.trim();

  const reset = (event) => {
    draft.onReset?.(event);
    setFiles([]);
    setLinks("");
    setComment("");
    setFileProblem("");
  };

  return (
    <form className="workflow-form submit-form" onSubmit={onSubmit} onInput={draft.onInput} onChange={draft.onChange} onReset={reset}>
      <div className="submit-form-head">
        <b>{submission ? `Sửa bài nộp lần ${submission.version}` : "Nộp kết quả"}</b>
        <small>
          {submission ? `Thay đổi sẽ được báo tới ${recipients}` : `Gửi tới ${recipients} để duyệt`}
          {task.share_submissions === false && " · Chỉ người duyệt và người giao xem được"}
        </small>
      </div>
      {removed.map((id) => (
        <input key={id} type="hidden" name="remove_file_ids[]" value={id} />
      ))}
      {kept.length > 0 && (
        <ul className="submit-existing-files">
          {kept.map((file) => (
            <li key={file.id}>
              <Paperclip size={14} />
              <span>{file.original_name}</span>
              <button type="button" disabled={saving} title="Bỏ file này" aria-label={`Bỏ file ${file.original_name}`} onClick={() => setRemoved((current) => [...current, file.id])}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label>
        {submission ? "Thêm file" : "File kết quả"}
        <input
          name="submission_files[]"
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.zip,.rar"
          disabled={saving}
          onChange={async (event) => {
            const list = [...event.target.files];
            setFiles(list);
            setFileProblem((await uploadProblem(list)) ?? "");
          }}
        />
        {fileProblem && <small className="submit-field-error">{fileProblem}</small>}
      </label>
      <label>
        Đường link (mỗi dòng một link)
        <textarea name="submission_links" rows="2" value={links} disabled={saving} onChange={(event) => setLinks(event.target.value)} placeholder="https://drive.google.com/..." />
        {badLines.length > 0 && (
          <small className="submit-field-error">
            {badLines.length === 1 ? `Dòng ${badLines[0]}` : `Các dòng ${badLines.join(", ")}`} không phải link hợp lệ (cần bắt đầu bằng http:// hoặc https://).
          </small>
        )}
      </label>
      <label>
        Ghi chú
        <textarea name="comment" rows="2" value={comment} disabled={saving} onChange={(event) => setComment(event.target.value)} placeholder="Mô tả kết quả đã làm..." />
      </label>
      <div className="drawer-action-row end">
        {blocked && <span className="submit-hint">{blocked}</span>}
        {onCancel && (
          <button type="button" className="secondary-btn" disabled={saving} onClick={onCancel}>
            Hủy
          </button>
        )}
        <button className="primary-btn" disabled={saving || Boolean(blocked)}>
          <Send size={15} /> {saving ? (submission ? "Đang lưu..." : "Đang nộp...") : submission ? "Lưu thay đổi" : "Nộp kết quả"}
        </button>
      </div>
    </form>
  );
}

const SUBMISSION_STATUS = {
  submitted: "Chờ duyệt",
  approved: "Đã duyệt",
  revision_required: "Cần sửa",
};

function SubmissionGroups({ task, saving, editingId, onEdit, onUpdate, onPreview, onDownload, onShare, onToggleSharing }) {
  const [toggled, setToggled] = useState({});
  const [showOlder, setShowOlder] = useState({});
  useEffect(() => {
    setToggled({});
    setShowOlder({});
  }, [task.id]);
  const submissions = task.submissions || [];
  const groups = [];
  submissions.forEach((submission) => {
    const key = submission.employee_id ?? submission.submitter;
    const group = groups.find((item) => item.key === key);
    if (group) group.items.push(submission);
    else groups.push({ key, items: [submission] });
  });
  const latest = groups.map((group) => group.items[0]);
  const count = (status) => latest.filter((submission) => submission.status === status).length;
  const isOpen = (submission, index) =>
    editingId === submission.id || (toggled[submission.id] ?? (index === 0 && submission.status !== "approved"));

  const canToggle = task.can_manage && !task.is_personal;
  const privateView = !task.share_submissions && !task.can_view_all_submissions;

  return (
    <section className={`drawer-section teacher-submissions ${submissions.length || canToggle || privateView ? "" : "empty"}`}>
      <div className="submission-head">
        <h4>Bài nộp {!!submissions.length && <em>{submissions.length}</em>}</h4>
        {canToggle && (
          <label className="share-switch" title="Cho người thực hiện xem bài nộp của nhau">
            <input type="checkbox" checked={task.share_submissions} disabled={saving} onChange={(event) => onToggleSharing(event.target.checked)} />
            <i />
            <span>Xem chéo bài nộp</span>
          </label>
        )}
      </div>
      {privateView && <p className="submission-private-note">Bạn chỉ thấy bài nộp của mình. Người duyệt và người giao xem được tất cả.</p>}
      {groups.length > 1 && (
        <p className="submission-summary">
          <b>{groups.length}</b> người đã nộp
          {!!count("submitted") && <> · <span className="submitted">{count("submitted")} chờ duyệt</span></>}
          {!!count("revision_required") && <> · <span className="revision_required">{count("revision_required")} cần sửa</span></>}
          {!!count("approved") && <> · <span className="approved">{count("approved")} đã duyệt</span></>}
        </p>
      )}
      {!submissions.length && <p className="submission-empty">Chưa có bài nộp.</p>}
      <div className="submission-list">
        {groups.map((group) => {
          const older = group.items.slice(1);
          const visible = showOlder[group.key] ? group.items : group.items.slice(0, 1);
          return (
            <div className="submission-group" key={group.key}>
              {visible.map((submission) => {
                const index = group.items.indexOf(submission);
                return (
                  <SubmissionCard
                    key={submission.id}
                    task={task}
                    submission={submission}
                    open={isOpen(submission, index)}
                    older={index > 0}
                    editing={editingId === submission.id}
                    saving={saving}
                    onToggle={() => setToggled((current) => ({ ...current, [submission.id]: !isOpen(submission, index) }))}
                    onEdit={onEdit}
                    onUpdate={onUpdate}
                    onPreview={onPreview}
                    onDownload={onDownload}
                    onShare={onShare}
                  />
                );
              })}
              {!!older.length && (
                <button type="button" className="submission-older-toggle" onClick={() => setShowOlder((current) => ({ ...current, [group.key]: !current[group.key] }))}>
                  <ChevronDown size={14} className={showOlder[group.key] ? "open" : ""} />
                  {showOlder[group.key] ? "Ẩn các lần nộp trước" : `${older.length} lần nộp trước`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SubmissionCard({ task, submission, open, older, editing, saving, onToggle, onEdit, onUpdate, onPreview, onDownload, onShare }) {
  const fileUrl = (file) => `/api/tasks/${task.id}/submissions/${submission.id}/attachments/${file.id}`;
  return (
    <article className={`${open ? "open" : "collapsed"} ${older ? "older" : ""}`}>
      <header>
        {submission.submitter_avatar_url ? (
          <img className="submission-avatar" src={submission.submitter_avatar_url} alt={`Ảnh của ${submission.submitter}`} />
        ) : (
          <Avatar className="submission-avatar-fallback" name={submission.submitter} />
        )}
        <div className="submission-who">
          <div className="submission-title">
            <strong title={submission.submitter}>{submission.submitter}</strong>
            <span>Lần {submission.version}</span>
            <b className={`submission-status ${submission.status}`}>{SUBMISSION_STATUS[submission.status] ?? submission.status}</b>
          </div>
          <small>
            Nộp {formatMoment(submission.submitted_at)}
            {submission.edited_at && <> · Đã sửa {formatMoment(submission.edited_at)}</>}
          </small>
        </div>
        {!editing && (
          <div className="submission-actions">
            {submission.can_edit && (
              <button type="button" className="row-edit-btn" disabled={saving} title="Sửa bài nộp" onClick={() => onEdit(submission.id)}>
                <Pencil size={13} /> Sửa
              </button>
            )}
            <button type="button" className="submission-toggle" aria-expanded={open} title={open ? "Thu gọn" : "Xem chi tiết"} onClick={onToggle}>
              <ChevronDown size={16} className={open ? "open" : ""} />
            </button>
          </div>
        )}
      </header>
      {editing ? (
        <SubmissionForm task={task} submission={submission} saving={saving} onSubmit={onUpdate} onCancel={() => onEdit(null)} />
      ) : (
        open && (
          <>
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
              <div className="drawer-files">
                {submission.files.map((file, index, all) => (
                  <DrawerFile
                    key={file.id}
                    name={file.original_name}
                    size={file.size}
                    onOpen={() => onPreview(all.map((f) => ({ key: f.id, name: f.original_name, mime_type: f.mime_type, size: f.size, url: fileUrl(f) })), index)}
                    onDownload={() => onDownload(fileUrl(file), file.original_name)}
                    onShare={file.can_share ? () => onShare(file) : null}
                  />
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
          </>
        )
      )}
    </article>
  );
}

const CHAT_PAGE = 20;
const CHAT_FILTERS = [
  ["all", "Tất cả"],
  ["comment", "Bình luận"],
  ["activity", "Hoạt động"],
];
const AUTHOR_ROLE = { reviewer: "Người duyệt", assigner: "Người giao việc" };

function baselineSeen(taskId, lastId) {
  const all = readSeen();
  if (all[taskId] !== undefined) return all[taskId];
  localStorage.setItem(CHAT_SEEN_KEY, JSON.stringify({ ...all, [taskId]: lastId }));
  return lastId;
}

function readSeen() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}

function useNarrowScreen() {
  const query = "(max-width: 1023px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

const CHANGE_PREFIX = "Đã cập nhật công việc:";

function ActivityText({ content }) {
  if (!content.startsWith(CHANGE_PREFIX)) return content;
  const changes = content.slice(CHANGE_PREFIX.length).trim().replace(/\.$/, "").split(" · ");
  return (
    <>
      {CHANGE_PREFIX}
      <ul className="activity-changes">
        {changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
    </>
  );
}

function TaskChat({ task, saving, editingComment, onEditComment, onSaveComment, onComment, onDraftChange, tab, collapsed, onToggle }) {
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(CHAT_PAGE);
  const updates = [...(task.updates || [])].reverse();
  const lastId = updates.reduce((max, item) => Math.max(max, item.id), 0);
  const [seen, setSeen] = useState(() => baselineSeen(task.id, lastId));
  const listRef = useRef(null);
  const narrow = useNarrowScreen();
  const unread = updates.filter((item) => item.id > seen).length;
  const visible = narrow ? tab === "chat" : !collapsed;
  const counts = {
    all: updates.length,
    comment: updates.filter((item) => item.kind !== "activity").length,
    activity: updates.filter((item) => item.kind === "activity").length,
  };
  const filtered = filter === "all" ? updates : updates.filter((item) => (filter === "activity") === (item.kind === "activity"));
  const shown = filtered.slice(-limit);
  const hidden = filtered.length - shown.length;

  useEffect(() => {
    setFilter("all");
    setLimit(CHAT_PAGE);
    setSeen(baselineSeen(task.id, lastId));
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!visible || !lastId) return;
    const all = readSeen();
    if ((all[task.id] ?? 0) >= lastId) return;
    localStorage.setItem(CHAT_SEEN_KEY, JSON.stringify({ ...all, [task.id]: lastId }));
    const timer = setTimeout(() => setSeen(lastId), 1500);
    return () => clearTimeout(timer);
  }, [visible, lastId, task.id]);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [task.id, updates.length, filter, tab, collapsed]);

  return (
    <section className={`task-drawer-chat comment-timeline ${collapsed ? "collapsed" : ""}`}>
      <button type="button" className="task-chat-rail" onClick={onToggle} title="Mở trao đổi" aria-expanded="false">
        <MessageSquare size={18} />
        <b>{updates.length}</b>
        {unread > 0 && <em>{unread} mới</em>}
        <span>Trao đổi</span>
      </button>
      <div className="task-chat-head">
        <div className="task-chat-title">
          <h4>
            Trao đổi {!!updates.length && <em>{updates.length}</em>}
            {unread > 0 && <span className="task-chat-new">{unread} mới</span>}
          </h4>
          <button type="button" className="task-chat-collapse" onClick={onToggle} title="Thu gọn trao đổi" aria-expanded="true">
            <ChevronsRight size={16} />
          </button>
        </div>
        {counts.activity > 0 && counts.comment > 0 && (
          <div className="task-chat-filters">
            {CHAT_FILTERS.map(([key, label]) => (
              <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
                {label} <em>{counts[key]}</em>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="task-chat-list" ref={listRef}>
        {hidden > 0 && (
          <button type="button" className="task-chat-older" onClick={() => setLimit((current) => current + CHAT_PAGE)}>
            Xem {Math.min(hidden, CHAT_PAGE)} tin cũ hơn
          </button>
        )}
        {!shown.length && <p className="task-chat-empty">Chưa có trao đổi nào. Hãy là người mở đầu.</p>}
        {shown.map((comment) =>
          comment.kind === "activity" ? (
            <div className={`comment-activity ${comment.id > seen ? "new" : ""}`} key={comment.id}>
              <Activity size={13} />
              <span>
                <b>{comment.creator_name || "Hệ thống"}</b> <ActivityText content={comment.content} /> <small>· {formatMoment(comment.created_at)}</small>
              </span>
            </div>
          ) : (
            <article className={`comment-item ${comment.author_role} ${comment.id > seen ? "new" : ""}`} key={comment.id}>
              {comment.creator_avatar_url ? (
                <img className="comment-avatar" src={comment.creator_avatar_url} alt={`Ảnh của ${comment.creator_name}`} />
              ) : (
                <Avatar name={comment.creator_name} />
              )}
              <div>
                <header>
                  <div className="comment-who">
                    <span>
                      <b title={comment.creator_name}>{comment.creator_name || "Người dùng"}</b>
                      <em>{AUTHOR_ROLE[comment.author_role] ?? "Người thực hiện"}</em>
                    </span>
                    <small>{formatMoment(comment.created_at)}</small>
                  </div>
                  {comment.can_edit && editingComment?.id !== comment.id && (
                    <button type="button" className="row-edit-btn" title="Sửa nhận xét" onClick={() => onEditComment(comment)}>
                      <Pencil size={13} /> Sửa
                    </button>
                  )}
                </header>
                {editingComment?.id === comment.id ? (
                  <form className="comment-edit-form" onSubmit={onSaveComment}>
                    <textarea name="content" required defaultValue={comment.content} rows="3" autoFocus />
                    <div>
                      <button type="button" className="secondary-btn" onClick={() => onEditComment(null)}>
                        Hủy
                      </button>
                      <button className="primary-btn">Lưu nhận xét</button>
                    </div>
                  </form>
                ) : (
                  <p>{comment.content}</p>
                )}
              </div>
            </article>
          ),
        )}
      </div>
      <div className="task-chat-composer">
        <CommentComposer task={task} saving={saving} onComment={onComment} onDraftChange={onDraftChange} />
      </div>
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
