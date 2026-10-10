import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Award,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ChevronRight,
  ClipboardCheck,
  Inbox,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  UserX,
} from "lucide-react";
import { apiFetch } from "./api";
import "./ManagementDashboard.css";

const SCOPES = { school: "Toàn trường", department: "Phạm vi đơn vị quản lý", self: "Cá nhân" };
const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const TASK_STATUS = { not_started: "Chưa thực hiện", in_progress: "Đang thực hiện", waiting_approval: "Chờ duyệt" };
const EVALUATION_TONES = { draft: "warn", submitted: "blue", unit_scored: "teal", published: "green" };
const AGENDA_LIMIT = 3;
const pad = (value) => String(value).padStart(2, "0");
const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shortDate = (value) => (value ? value.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "");
const number = (value) => (value == null ? "—" : Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 }));

const dueText = (iso) => {
  if (!iso) return "Không thời hạn";
  const due = new Date(iso);
  const days = Math.round((new Date(dayKey(due)) - new Date(dayKey(new Date()))) / 86400000);
  const time = due.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (days < 0) return `Quá hạn ${-days} ngày`;
  if (days === 0) return `Hôm nay ${time}`;
  if (days === 1) return `Ngày mai ${time}`;
  return `${shortDate(iso)} · còn ${days} ngày`;
};

const daysLeft = (date) => (date ? Math.round((new Date(date) - new Date(dayKey(new Date()))) / 86400000) : null);

export default function ManagementDashboard({ onTask, onKpi }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await apiFetch("/api/dashboard", { silent: true });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Không thể tải Tổng quan.");
      setData(payload);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    window.addEventListener("task-stats:updated", load);
    return () => {
      clearInterval(interval);
      window.removeEventListener("task-stats:updated", load);
    };
  }, [load]);

  if (!data) {
    return (
      <div className="home">
        <p className="home-loading">{error || "Đang tải Tổng quan…"}</p>
      </div>
    );
  }

  const openTasks = (filter) => window.dispatchEvent(new CustomEvent("dashboard:task-filter", { detail: filter }));
  const today = new Date();
  const { personal, queue, health, people } = data;
  const hasQueue = queue.review.count > 0 || queue.scoring || queue.drafts > 0;

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <h2>Xin chào, {data.name}</h2>
          <p>
            {WEEKDAYS[today.getDay()]}, {today.toLocaleDateString("vi-VN")}
            <span className="home-scope">{SCOPES[data.scope]}</span>
          </p>
        </div>
        <button type="button" className="secondary-btn" onClick={load} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? "spin" : ""} /> Làm mới
        </button>
      </header>
      {error && <div className="kpi-error">{error}</div>}

      <div className="home-grid">
        {personal && (
          <section className="home-card home-mine">
            <header>
              <h3><ClipboardCheck size={17} /> Việc của tôi</h3>
              <button type="button" className="home-link" onClick={() => openTasks({ employee_id: String(personal.employee_id) })}>Tất cả <ChevronRight size={14} /></button>
            </header>
            <div className="home-counters">
              <button type="button" onClick={() => openTasks({ employee_id: String(personal.employee_id) })}>
                <b>{personal.tasks.open}</b><span>Đang cần làm</span>
              </button>
              <button type="button" className={personal.tasks.overdue ? "bad" : ""} onClick={() => openTasks({ employee_id: String(personal.employee_id), action: "overdue" })}>
                <b>{personal.tasks.overdue}</b><span>Quá hạn</span>
              </button>
              <button type="button" className={personal.tasks.soon ? "warn" : ""} onClick={() => openTasks({ employee_id: String(personal.employee_id), due_from: dayKey(today), due_to: dayKey(new Date(today.getTime() + 3 * 86400000)) })}>
                <b>{personal.tasks.soon}</b><span>Đến hạn 3 ngày tới</span>
              </button>
              <button type="button" onClick={() => openTasks({ employee_id: String(personal.employee_id), status: "waiting_approval" })}>
                <b>{personal.tasks.waiting}</b><span>Đã nộp, chờ duyệt</span>
              </button>
            </div>
            <TaskList items={personal.tasks.items} onTask={onTask} empty="Bạn không có việc nào đang mở." />
          </section>
        )}

        {personal && (
          <div className="home-stack">
            {personal.evaluation && (
              <section className="home-card home-compact">
                <header>
                  <h3><Award size={17} /> Phiếu thi đua {personal.evaluation.period}</h3>
                </header>
                <EvaluationNote evaluation={personal.evaluation} onOpen={() => navigate(`/evaluations/${personal.evaluation.id}`)} />
              </section>
            )}
            <section className="home-card home-compact">
              <header>
                <h3><CalendarOff size={17} /> Nghỉ tháng {personal.leave.month}</h3>
                <button type="button" className="home-link" onClick={() => navigate("/personnel/leave")}>Theo dõi nghỉ <ChevronRight size={14} /></button>
              </header>
              <div className="home-leave">
                <span><b>{personal.leave.excused_sessions}</b> buổi có phép</span>
                <span className={personal.leave.unexcused ? "bad" : ""}><b>{personal.leave.unexcused}</b> lần không phép</span>
                {personal.leave.regime_sessions > 0 && <span><b>{personal.leave.regime_sessions}</b> buổi nghỉ chế độ</span>}
              </div>
            </section>
          </div>
        )}

        {hasQueue && (
          <section className="home-card home-queue">
            <header>
              <h3><Inbox size={17} /> Cần bạn xử lý</h3>
            </header>
            {queue.review.count > 0 && (
              <div className="home-queue-group">
                <button type="button" className="home-queue-head" onClick={() => openTasks({ action: "my_review" })}>
                  <span><b>{queue.review.count}</b> công việc chờ bạn duyệt</span>
                  <ChevronRight size={15} />
                </button>
                <ul>
                  {queue.review.items.map((task) => (
                    <li key={task.id}>
                      <button type="button" onClick={() => onTask(task.code)}>
                        <code>{task.code}</code>
                        <span>{task.title}</span>
                        <small>{task.assignees?.join(", ")}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {queue.scoring && (
              <div className="home-queue-group">
                <button type="button" className="home-queue-head" onClick={() => navigate(`/evaluations?tab=board&period=${queue.scoring.period_id}`)}>
                  <span><b>{queue.scoring.count}</b> phiếu thi đua {queue.scoring.period} chờ bạn chấm</span>
                  <ChevronRight size={15} />
                </button>
                <ul>
                  {queue.scoring.items.map((sheet) => (
                    <li key={sheet.id}>
                      <button type="button" onClick={() => navigate(`/evaluations/${sheet.id}`)}>
                        <span>{sheet.name}</span>
                        <small>{sheet.column}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {queue.drafts > 0 && (
              <button type="button" className="home-queue-head single" onClick={() => navigate("/tasks/ai")}>
                <span><Sparkles size={14} /> <b>{queue.drafts}</b> bản nháp AI chưa tạo công việc</span>
                <ChevronRight size={15} />
              </button>
            )}
          </section>
        )}

        {health && (
          <section className="home-card home-health">
            <header>
              <h3>Tình hình chung · tháng {health.period}</h3>
              {onKpi && <button type="button" className="home-link" onClick={onKpi}>Xem thống kê <ChevronRight size={14} /></button>}
            </header>
            <TaskHealth tasks={health.tasks} onOpen={() => openTasks({ due_from: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`, due_to: dayKey(new Date(today.getFullYear(), today.getMonth() + 1, 0)) })} />
            {health.evaluation && <EvaluationProgress evaluation={health.evaluation} onOpen={() => navigate(`/evaluations?tab=board&period=${health.evaluation.id}`)} />}
          </section>
        )}

        {people.leave && (
          <section className="home-card home-absent">
            <header>
              <h3><UserX size={17} /> Vắng mặt hôm nay</h3>
              <button type="button" className="home-link" onClick={() => navigate("/personnel/leave")}>Theo dõi nghỉ <ChevronRight size={14} /></button>
            </header>
            {people.leave.today.length ? (
              <ul className="home-absent-list">
                {people.leave.today.map((row, index) => (
                  <li key={index}>
                    <b>{row.name}</b>
                    <span className={`home-leave-type ${row.type}`}>{row.type_label}</span>
                    <small>đến {shortDate(row.until)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="home-empty">Hôm nay không ai nghỉ.</p>
            )}
            <small className="home-foot">{people.leave.week} người có lịch nghỉ trong 7 ngày tới</small>
          </section>
        )}

        <section className="home-card home-agenda">
          <header>
            <h3><CalendarDays size={17} /> 7 ngày tới</h3>
            <small>{data.scope === "self" ? "Việc của bạn" : "Việc đến hạn trong phạm vi"} và các mốc đánh giá</small>
          </header>
          <Agenda items={people.upcoming} onTask={onTask} onPeriod={(id) => navigate(`/evaluations?tab=board&period=${id}`)} />
        </section>
      </div>
    </div>
  );
}

function TaskList({ items, onTask, empty }) {
  if (!items.length) return <p className="home-empty">{empty}</p>;
  return (
    <ul className="home-tasks">
      {items.map((task) => (
        <li key={task.id}>
          <button type="button" onClick={() => onTask(task.code)}>
            <span className="home-task-main">
              <code>{task.code}</code>
              <b title={task.title}>{task.title}</b>
            </span>
            <span className={`home-due ${task.overdue ? "bad" : daysLeft(task.due_at) !== null && daysLeft(task.due_at) <= 1 ? "warn" : ""}`}>
              <CalendarClock size={13} /> {dueText(task.due_at)}
            </span>
            <small>{TASK_STATUS[task.status] ?? task.status}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EvaluationNote({ evaluation, onOpen }) {
  const left = daysLeft(evaluation.self_due_on);
  const pending = evaluation.status === "draft" && evaluation.period_status === "open";
  return (
    <div className="home-eval">
      <span className={`home-pill ${EVALUATION_TONES[evaluation.status] ?? ""}`}>{evaluation.status_label}</span>
      <p>
        {pending
          ? left == null
            ? "Bạn chưa nộp phiếu tự đánh giá."
            : left >= 0
              ? `Hạn tự chấm ${shortDate(evaluation.self_due_on)} · còn ${left} ngày.`
              : `Đã quá hạn tự chấm ${-left} ngày.`
          : evaluation.period_status === "disclosed"
            ? "Đã có kết quả dự kiến — xem và giải trình nếu cần."
            : "Phiếu đã nộp, đang chờ chấm và duyệt."}
      </p>
      <button type="button" className={pending ? "primary-btn" : "secondary-btn"} onClick={onOpen}>
        {pending ? "Tự chấm ngay" : "Xem phiếu"}
      </button>
    </div>
  );
}

const PARTS = [
  ["completed", "Hoàn thành"],
  ["waiting", "Chờ duyệt"],
  ["open", "Đang làm"],
  ["overdue", "Quá hạn"],
];

function TaskHealth({ tasks, onOpen }) {
  const total = tasks.assigned || 0;
  return (
    <button type="button" className="home-health-tasks" onClick={onOpen}>
      <span className="home-health-top">
        <span><b>{number(tasks.assigned)}</b> việc có hạn trong tháng</span>
        <span><b>{tasks.completion_rate == null ? "—" : `${number(tasks.completion_rate)}%`}</b> hoàn thành</span>
        <span className={tasks.overdue ? "bad" : ""}><b>{tasks.overdue}</b> quá hạn</span>
      </span>
      <span className="home-bar">{total ? PARTS.map(([key]) => tasks[key] > 0 && <i key={key} className={key} style={{ width: `${(tasks[key] / total) * 100}%` }} />) : null}</span>
      <span className="home-bar-legend">
        {PARTS.map(([key, label]) => <span key={key}><i className={key} /> {label} {tasks[key]}</span>)}
      </span>
    </button>
  );
}

function EvaluationProgress({ evaluation, onOpen }) {
  const total = evaluation.total || 0;
  const steps = [
    ["Đã nộp", evaluation.submitted],
    ["Đã chấm", evaluation.scored],
  ];
  const selfLeft = daysLeft(evaluation.self_due_on);
  return (
    <button type="button" className="home-health-eval" onClick={onOpen}>
      <span className="home-health-eval-head">
        <b><Award size={15} /> Thi đua {evaluation.label}</b>
        <span className="home-pill blue">{evaluation.status_label}</span>
      </span>
      {steps.map(([label, value]) => (
        <span key={label} className="home-step">
          <span>{label}</span>
          <span className="home-step-track"><i style={{ width: `${total ? (value / total) * 100 : 0}%` }} /></span>
          <b>{value}/{total}</b>
        </span>
      ))}
      <span className="home-eval-meta">
        {evaluation.awaiting_leader > 0 && <span className="warn"><TriangleAlert size={12} /> {evaluation.awaiting_leader} phiếu GV chờ BGH chấm</span>}
        {evaluation.self_due_on && <span>Tự chấm đến {shortDate(evaluation.self_due_on)}{selfLeft != null && selfLeft >= 0 ? ` (còn ${selfLeft} ngày)` : ""}</span>}
        {evaluation.unit_due_on && <span>Chấm phiếu đến {shortDate(evaluation.unit_due_on)}</span>}
      </span>
    </button>
  );
}

function Agenda({ items, onTask, onPeriod }) {
  const [openDays, setOpenDays] = useState(() => new Set());
  if (!items.length) return <p className="home-empty">Không có việc đến hạn trong 7 ngày tới.</p>;
  const days = items.reduce((map, item) => ((map[item.date] ||= []).push(item), map), {});
  const label = (date) => {
    const left = daysLeft(date);
    const day = new Date(date);
    if (left === 0) return "Hôm nay";
    if (left === 1) return "Ngày mai";
    return `${WEEKDAYS[day.getDay()]}, ${shortDate(date)}`;
  };
  return (
    <div className="home-agenda-days">
      {Object.entries(days).map(([date, list]) => (
        <div key={date} className="home-agenda-day">
          <h4>{label(date)} <small>{list.length} mục</small></h4>
          <ul>
            {(openDays.has(date) ? list : list.slice(0, AGENDA_LIMIT)).map((item, index) => (
              <li key={`${item.kind}-${item.id ?? index}`}>
                {item.kind === "task" ? (
                  <button type="button" onClick={() => onTask(item.code)}>
                    <code>{item.code}</code>
                    <span title={item.title}>{item.title}</span>
                    <small>{new Date(item.due_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</small>
                  </button>
                ) : (
                  <button type="button" className="milestone" onClick={() => onPeriod(item.period_id)}>
                    <Award size={13} />
                    <span>{item.title}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
          {list.length > AGENDA_LIMIT && !openDays.has(date) && (
            <button type="button" className="home-agenda-more" onClick={() => setOpenDays((current) => new Set([...current, date]))}>
              + {list.length - AGENDA_LIMIT} việc khác
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
