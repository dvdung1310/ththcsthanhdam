import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Hourglass,
  ShieldAlert,
  Users,
  ChevronDown,
} from "lucide-react";
import { apiFetch } from "./api";
import "./ManagementDashboard.css";

export default function ManagementDashboard({ onTask, onKpi }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/api/dashboard", { silent: true });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.message || "Không thể tải Tổng quan.");
      setData(payload);
      setError("");
    } catch (e) {
      setError(e.message);
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
  if (!data)
    return (
      <div className="management-dashboard">
        <p>{error || "Đang tải dữ liệu Tổng quan…"}</p>
      </div>
    );
  const personal = data.scope === "self";
  const now = new Date();
  const dateValue = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const monthRange = {
    due_from: dateValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    due_to: dateValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
  const compare = (key, unit = "") => {
    const current = data.current[key],
      previous = data.previous[key];
    if (current == null || previous == null)
      return { text: "Chưa đủ dữ liệu để so sánh", tone: "neutral" };
    const delta = Math.round((current - previous) * 100) / 100;
    return {
      text: `${delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} ${Math.abs(delta)}${unit} so với tháng trước`,
      tone: delta > 0 ? "up" : delta < 0 ? "down" : "neutral",
    };
  };
  const cards = [
    {
      label: "Công việc tháng này",
      value: data.current.workload,
      icon: ClipboardCheck,
      tone: "purple",
      comparison: compare("workload", " việc"),
    },
    {
      label: "Tỷ lệ hoàn thành",
      value:
        data.current.completion == null ? "—" : `${data.current.completion}%`,
      icon: Activity,
      tone: "blue",
      comparison: compare("completion", " điểm %"),
    },
    {
      label: "Hoàn thành đúng hạn",
      value: data.current.on_time == null ? "—" : `${data.current.on_time}%`,
      icon: CheckCircle2,
      tone: "green",
      comparison: compare("on_time", " điểm %"),
    },
    {
      label: "Việc cần xử lý",
      value: data.attention.total,
      icon: ShieldAlert,
      tone: "orange",
      note: "Chờ duyệt, quá hạn hoặc sắp đến hạn",
    },
    {
      label: "Chờ duyệt",
      value: data.progress.waiting,
      icon: Hourglass,
      tone: "pink",
      note: "Đã gửi kết quả, đang chờ người duyệt",
    },
    {
      label: personal
        ? "Nhiệm vụ chưa hoàn thành"
        : "Giáo viên đang có nhiệm vụ",
      value: personal
        ? Object.values(data.progress).reduce((sum, n) => sum + n, 0) -
          data.progress.completed
        : `${data.resources.active}/${data.resources.total}`,
      icon: Users,
      tone: "cyan",
      note: personal
        ? "Trong tháng hiện tại"
        : "Giáo viên có nhiệm vụ trong tháng / đang công tác",
    },
  ];
  return (
    <div className="management-dashboard">
      <header className="management-heading">
        <div>
          <span>TỔNG QUAN VẬN HÀNH</span>
          <h2>
            {personal
              ? "Công việc & hiệu suất của bạn"
              : data.scope === "department"
                ? "Điều hành tổ phụ trách"
                : "Điều hành toàn trường"}
          </h2>
          <p>
            Tháng {data.period} ·{" "}
            {personal
              ? "Phạm vi cá nhân"
              : data.scope === "department"
                ? "Chỉ dữ liệu trong tổ được phụ trách"
                : "Dữ liệu toàn trường"}
          </p>
        </div>
        <button onClick={load}>Làm mới</button>
      </header>
      {error && <p className="management-error">{error}</p>}
      <section className="management-cards">
        {cards.map(({ label, value, icon: Icon, tone, comparison, note }) => (
          <article key={label}>
            <div className={`management-icon ${tone}`}>
              <Icon size={22} />
            </div>
            <strong>{value}</strong>
            <b>{label}</b>
            <small className={comparison?.tone}>
              {comparison?.text || note}
            </small>
          </article>
        ))}
      </section>
      <div className="management-panels">
        <section className="management-panel">
          <header>
            <h3>Cần chú ý</h3>
            <span>Ưu tiên xử lý</span>
          </header>
          <div className="attention-summary">
            <div>
              <b>{data.attention.waiting}</b>
              <span>Công việc chờ duyệt</span>
            </div>
            <div>
              <b>{data.attention.soon}</b>
              <span>Công việc còn dưới 24 giờ</span>
            </div>
            <div className="danger">
              <b>{data.attention.overdue}</b>
              <span>Công việc quá hạn</span>
            </div>
            <div>
              <b>{data.attention.high_load.length}</b>
              <span>
                {personal
                  ? "Cảnh báo tải công việc cao"
                  : "Giáo viên có tải cao"}
              </span>
            </div>
          </div>
          <div className="management-attention-list">
            {data.attention.tasks.map((task) => (
              <button key={task.id} onClick={() => onTask(task.code)}>
                <span>
                  <b>{task.title}</b>
                  <small>{task.code}</small>
                </span>
                <em className={task.reason === "Quá hạn" ? "danger" : ""}>
                  {task.reason}
                </em>
              </button>
            ))}
            {!data.attention.tasks.length && (
              <p className="management-empty">Không có công việc cần chú ý.</p>
            )}
          </div>
          {!!data.attention.high_load.length && (
            <p className="workload-note">
              Tải cao:{" "}
              {data.attention.high_load
                .map((t) => `${t.name} (${t.count} việc)`)
                .join(", ")}
              . Ngưỡng: từ 5 việc chưa hoàn thành.
            </p>
          )}
        </section>
        <section className="management-panel">
          <header>
            <h3>Tiến độ tháng</h3>
            <CalendarClock size={18} />
          </header>
          <p className="management-muted">
            {data.current.workload} công việc có hạn hoàn thành trong tháng
          </p>
          {[
            ["completed", "completed", "Đã hoàn thành", "green"],
            ["waiting", "waiting_approval", "Chờ duyệt", "blue"],
            ["in_progress", "in_progress", "Đang thực hiện", "purple"],
            ["not_started", "not_started", "Chưa thực hiện", "red"],
          ].map(([key, status, label, color]) => {
            const count = data.progress[key],
              percent = data.current.workload
                ? Math.round((count / data.current.workload) * 1000) / 10
                : 0;
            return (
              <button
                type="button"
                className="month-progress"
                key={key}
                onClick={() => window.dispatchEvent(new CustomEvent("dashboard:task-filter", { detail: { status, ...monthRange } }))}
              >
                <div>
                  <span>{label}</span>
                  <b>
                    {percent}% <small>({count} việc)</small>
                  </b>
                </div>
                <span className="month-track">
                  <i className={color} style={{ width: `${percent}%` }} />
                </span>
              </button>
            );
          })}
          {!data.current.workload && (
            <p className="management-empty">
              Chưa có nhiệm vụ đến hạn trong tháng.
            </p>
          )}
        </section>
        <section className="management-panel department-panel">
          <header>
            <h3>{personal ? "Kết quả của bạn tháng này" : "Theo tổ / nhóm"}</h3>
            <button onClick={onKpi}>Xem thống kê</button>
          </header>
          <p className="management-muted">
            Số công việc hoàn thành / có hạn trong tháng
          </p>
          {personal ? (
            <strong className="personal-dashboard-kpi">
              {data.personal
                ? `${data.personal.completed}/${data.personal.assigned} việc`
                : "Chưa có dữ liệu"}
            </strong>
          ) : (
            data.departments.map((dept) => (
              <div className="department-kpi-item" key={dept.id}>
                <button
                  onClick={() =>
                    setExpanded(expanded === dept.id ? null : dept.id)
                  }
                >
                  <span>{dept.name}</span>
                  <b>
                    {dept.completed}/{dept.assigned}
                    {dept.completion != null && ` · ${dept.completion}%`}
                  </b>
                  <ChevronDown size={16} />
                </button>
                {expanded === dept.id && (
                  <div className="department-teacher-list">
                    {dept.teachers.map((teacher) => (
                      <div key={teacher.id}>
                        <span>{teacher.name}</span>
                        <b>
                          {teacher.completed}/{teacher.assigned} việc
                        </b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {!personal && !data.departments.length && (
            <p className="management-empty">
              Chưa có tổ trong phạm vi của bạn.
            </p>
          )}
        </section>
      </div>
      <p className="dashboard-methodology">
        Nhiệm vụ tháng tính theo hạn hoàn thành, không bao gồm việc đã hủy. Đúng
        hạn tính theo lúc gửi hoàn thành (hoặc lúc xác nhận nếu chưa nộp).
      </p>
    </div>
  );
}
