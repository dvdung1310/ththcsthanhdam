import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { apiFetch } from "./api";
import "./KpiReport.css";
import "./KpiTaskDetails.css";
import "./KpiAnalytics.css";
const n = (v) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const statusLabels = {
  not_started: "Chưa thực hiện",
  in_progress: "Đang thực hiện",
  waiting_approval: "Chờ duyệt",
  completed: "Hoàn thành",
};
export default function TaskStats({ onTask }) {
  const now = new Date();
  const [filters, setFilters] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    department_id: "",
    teacher_id: "",
    category_id: "",
    compare: "previous",
  });
  const [report, setReport] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelected(null);
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== ""),
    );
    apiFetch("/api/task-stats?" + params, { signal: controller.signal })
      .then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.message || "Không thể tải thống kê");
        setReport(p);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters]);
  const change = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: value,
      ...(key === "department_id" ? { teacher_id: "" } : {}),
    }));
  const refs = report?.references || {},
    current = report?.current || {},
    previous = report?.previous;
  const cards = [
    ["assigned", "Công việc có hạn trong tháng", "việc"],
    ["completed", "Đã hoàn thành", "việc"],
    ["waiting", "Đang chờ duyệt", "việc"],
    ["overdue", "Quá hạn chưa nộp", "việc"],
    ["completion_rate", "Tỷ lệ hoàn thành", "%"],
    ["on_time_rate", "Hoàn thành đúng hạn", "%"],
  ];
  const lowerIsBetter = ["overdue", "waiting"];
  const open = Math.max(
    0,
    (current.assigned || 0) -
      (current.completed || 0) -
      (current.waiting || 0) -
      (current.overdue || 0),
  );
  const breakdown = [
    ["Hoàn thành", current.completed || 0],
    ["Chờ duyệt", current.waiting || 0],
    ["Đang thực hiện / chưa đến hạn", open],
    ["Quá hạn chưa nộp", current.overdue || 0],
  ];
  const options = (key, label, rows) => (
    <label>
      {label}
      <select
        value={filters[key]}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">Tất cả</option>
        {rows?.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="kpi-page kpi-analysis" aria-busy={loading}>
      <header className="kpi-header">
        <div>
          <h2>Thống kê công việc</h2>
          <p>Tình hình giao, thực hiện và hoàn thành công việc theo tháng</p>
        </div>
        <span>
          {report?.scope === "school"
            ? "Toàn trường"
            : report?.scope === "department"
              ? "Phạm vi đơn vị quản lý"
              : "Cá nhân"}
        </span>
      </header>
      <section className="kpi-analysis-filters">
        <label>
          Thời gian
          <div>
            <select
              aria-label="Tháng thống kê"
              value={filters.month}
              onChange={(e) => change("month", +e.target.value)}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  Tháng {i + 1}
                </option>
              ))}
            </select>
            <input
              aria-label="Năm thống kê"
              type="number"
              min="2020"
              max="2100"
              value={filters.year}
              onChange={(e) => change("year", e.target.value)}
            />
          </div>
        </label>
        {options("department_id", "Tổ / nhóm", refs.departments)}
        {options(
          "teacher_id",
          "Giáo viên",
          refs.teachers?.filter(
            (t) =>
              !filters.department_id ||
              t.department_ids.includes(+filters.department_id),
          ),
        )}
        {options("category_id", "Loại nhiệm vụ", refs.task_types)}
        <label>
          So sánh với
          <select
            value={filters.compare}
            onChange={(e) => change("compare", e.target.value)}
          >
            <option value="previous">Tháng trước</option>
            <option value="year">Cùng kỳ năm trước</option>
            <option value="none">Không so sánh</option>
          </select>
        </label>
      </section>
      {error && <div className="kpi-error">{error}</div>}
      {loading ? (
        <p role="status">Đang tải thống kê…</p>
      ) : (
        !error &&
        report && (
          <>
            <p className="kpi-period-caption">
              Tháng {report.period} ·{" "}
              {refs.departments?.find((d) => d.id === +filters.department_id)
                ?.name || "Tất cả đơn vị trong phạm vi"}{" "}
              ·{" "}
              {refs.teachers?.find((t) => t.id === +filters.teacher_id)?.name ||
                "Tất cả giáo viên"}
              {previous && " · So với " + report.comparison_period}
              {report.no_deadline_open > 0 &&
                ` · ${report.no_deadline_open} việc không thời hạn đang mở (không tính vào thống kê tháng)`}
            </p>
            <section className="kpi-analytic-cards">
              {cards.map(([key, label, unit]) => {
                const delta =
                  previous?.[key] != null && current[key] != null
                    ? +(current[key] - previous[key]).toFixed(1)
                    : null;
                const good = lowerIsBetter.includes(key)
                  ? delta <= 0
                  : delta >= 0;
                return (
                  <article
                    key={key}
                    className={key === "overdue" && current[key] > 0 ? "loss-card" : ""}
                  >
                    <span>{label}</span>
                    <b>
                      {n(current[key])} <small>{unit}</small>
                    </b>
                    {previous && (
                      <small
                        className={
                          delta == null || delta === 0
                            ? ""
                            : good
                              ? "delta-good"
                              : "delta-bad"
                        }
                      >
                        {delta == null
                          ? "Chưa đủ dữ liệu so sánh"
                          : (delta > 0 ? "↑ " : delta < 0 ? "↓ " : "↔ ") +
                            n(Math.abs(delta)) +
                            (unit === "%" ? " điểm %" : "") +
                            " so với " +
                            report.comparison_period}
                      </small>
                    )}
                  </article>
                );
              })}
            </section>
            <section className="kpi-chart-grid">
              <article className="kpi-analysis-panel">
                <h3>Tỷ lệ hoàn thành · 6 tháng</h3>
                <div
                  className="kpi-trend"
                  role="img"
                  aria-label={report.trend
                    .map((r) => r.period + ": " + n(r.completion_rate) + "%")
                    .join("; ")}
                >
                  {report.trend.map((r) => (
                    <div key={r.period}>
                      <b>{r.completion_rate == null ? "—" : n(r.completion_rate) + "%"}</b>
                      <div className="kpi-trend-track">
                        <span style={{ height: (r.completion_rate || 0) + "%" }} />
                      </div>
                      <small>
                        {r.period} · {r.assigned} việc
                      </small>
                    </div>
                  ))}
                </div>
                <p>Tháng không có công việc đến hạn hiển thị “—”.</p>
              </article>
              <article className="kpi-analysis-panel">
                <h3>Tình trạng công việc trong tháng</h3>
                <strong className="kpi-loss-total">{n(current.assigned)} việc</strong>
                {breakdown.map(([name, count]) => (
                  <div className="kpi-loss-row" key={name}>
                    <div>
                      <span>{name}</span>
                      <b>
                        {count} việc ·{" "}
                        {current.assigned ? n((count / current.assigned) * 100) : 0}%
                      </b>
                    </div>
                    <div className="kpi-loss-track">
                      <span
                        style={{
                          width: (current.assigned ? (count / current.assigned) * 100 : 0) + "%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </article>
            </section>
            <article className="kpi-analysis-panel">
              <h3>
                Theo tổ / nhóm <small>Bấm để lọc theo đơn vị</small>
              </h3>
              <div className="kpi-department-grid">
                {report.departments.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => change("department_id", String(d.id))}
                  >
                    <span>
                      {d.name}
                      <small>
                        {d.teachers} giáo viên · {d.completed}/{d.assigned} việc hoàn thành
                        {d.overdue > 0 && ` · ${d.overdue} quá hạn`}
                      </small>
                    </span>
                    <b>
                      {d.completion_rate == null ? "—" : n(d.completion_rate) + "%"} <ArrowRight size={16} />
                    </b>
                  </button>
                ))}
                {!report.departments.length && (
                  <p>Không có dữ liệu đơn vị phù hợp.</p>
                )}
              </div>
            </article>
            <section className="kpi-table-card">
              <div className="kpi-filters">
                <h3>Theo giáo viên</h3>
                <span className="kpi-result-count">
                  {report.data.length} giáo viên
                </span>
              </div>
              <div className="kpi-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Giáo viên</th>
                      <th>Tổ / nhóm</th>
                      <th>Công việc</th>
                      <th>Hoàn thành</th>
                      <th>Chờ duyệt</th>
                      <th>Quá hạn</th>
                      <th>Tỷ lệ hoàn thành</th>
                      <th>Đúng hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.map((r) => (
                      <tr key={r.teacher_id}>
                        <td>
                          <button
                            className="kpi-teacher-link"
                            onClick={() => setSelected(r)}
                          >
                            <b>{r.teacher}</b>
                            <small>{r.employee_code} · Xem công việc</small>
                          </button>
                        </td>
                        <td>{r.department || "Chưa thuộc đơn vị"}</td>
                        <td>{r.assigned}</td>
                        <td>{r.completed}</td>
                        <td>{r.waiting}</td>
                        <td className={r.overdue > 0 ? "delta-bad" : ""}>{r.overdue}</td>
                        <td>
                          <strong className="kpi-total">
                            {r.completion_rate == null ? "—" : n(r.completion_rate) + "%"}
                          </strong>
                        </td>
                        <td>{r.on_time_rate == null ? "—" : n(r.on_time_rate) + "%"}</td>
                      </tr>
                    ))}
                    {!report.data.length && (
                      <tr>
                        <td colSpan="8" className="kpi-empty">
                          Không có giáo viên phù hợp.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="kpi-methodology">
              Thống kê theo công việc có hạn trong tháng, không tính công việc
              đã hủy. Công việc giao cho tổ / nhóm được tính cho mọi thành viên
              của đơn vị. Đúng hạn: lần nộp cuối (hoặc thời điểm hoàn thành nếu
              không có bản nộp) không vượt hạn.
            </p>
          </>
        )
      )}
      {selected && (
        <div className="modal-backdrop">
          <div
            className="kpi-task-modal"
            role="dialog"
            aria-modal="true"
            aria-label={"Công việc của " + selected.teacher}
          >
            <header>
              <div>
                <h3>Công việc của {selected.teacher}</h3>
                <p>
                  Tháng {report.period} · {selected.tasks.length} công việc
                </p>
              </div>
              <button aria-label="Đóng" onClick={() => setSelected(null)}>
                <X size={20} />
              </button>
            </header>
            <div className="kpi-task-list">
              {selected.tasks.map((t) => (
                <article key={t.id}>
                  <div className="kpi-task-main">
                    <code>{t.code}</code>
                    <b>{t.title}</b>
                    <small>{t.category || "Chưa có loại nhiệm vụ"}</small>
                    <small>
                      {statusLabels[t.status] || t.status} · Hạn:{" "}
                      {t.due_at
                        ? new Date(t.due_at).toLocaleString("vi-VN")
                        : "Không thời hạn"}
                    </small>
                    {t.revision_count > 0 && (
                      <small>Yêu cầu làm lại: {t.revision_count} lần</small>
                    )}
                  </div>
                  <div className="kpi-task-score">
                    {t.status === "completed" && (
                      <b>{t.is_late ? "Hoàn thành trễ hạn" : "Hoàn thành đúng hạn"}</b>
                    )}
                    {onTask && (
                      <button
                        className="kpi-open-task"
                        onClick={() => onTask(t.id)}
                      >
                        Chi tiết công việc <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!selected.tasks.length && (
                <p className="kpi-task-empty">
                  Không có công việc trong kỳ này.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
