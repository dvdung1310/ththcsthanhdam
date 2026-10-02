import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { apiFetch } from "./api";
import "./KpiReport.css";
import "./KpiTaskDetails.css";
import "./KpiAnalytics.css";
const n = (v) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
export default function KpiReport({ onTask }) {
  const now = new Date();
  const [filters, setFilters] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    department_id: "",
    teacher_id: "",
    task_catalog_item_id: "",
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
    apiFetch("/api/kpi-report?" + params, { signal: controller.signal })
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
    ["kpi", "KPI trung bình", "/ 10"],
    ["on_time", "Tỷ lệ đúng hạn", "%"],
    ["completion", "Tỷ lệ hoàn thành", "%"],
    ["first_approval", "Được duyệt lần đầu", "%"],
    ["late_penalty", "Điểm bị trừ do trễ hạn", "điểm"],
  ];
  const loss = report?.losses.reduce((s, r) => s + r.points, 0) || 0;
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
          <h2>KPI & Thống kê</h2>
          <p>Phân tích hiệu suất, chất lượng và nguyên nhân mất điểm</p>
        </div>
        <span>
          {report?.scope === "school"
            ? "Toàn trường"
            : report?.scope === "department"
              ? "Phạm vi tổ quản lý"
              : "Kết quả cá nhân"}
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
        {options("department_id", "Tổ chuyên môn", refs.departments)}
        {options(
          "teacher_id",
          "Giáo viên",
          refs.teachers?.filter(
            (t) =>
              !filters.department_id ||
              t.department_ids.includes(+filters.department_id),
          ),
        )}
        {options("task_catalog_item_id", "Loại nhiệm vụ", refs.task_types)}
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
                ?.name || "Tất cả tổ trong phạm vi"}{" "}
              ·{" "}
              {refs.teachers?.find((t) => t.id === +filters.teacher_id)?.name ||
                "Tất cả giáo viên"}
              {previous && " · So với " + report.comparison_period}
            </p>
            <section className="kpi-analytic-cards">
              {cards.map(([key, label, unit]) => {
                const delta =
                  previous?.[key] != null && current[key] != null
                    ? +(current[key] - previous[key]).toFixed(2)
                    : null;
                const good = key === "late_penalty" ? delta <= 0 : delta >= 0;
                return (
                  <article
                    key={key}
                    className={key === "late_penalty" ? "loss-card" : ""}
                  >
                    <span>{label}</span>
                    <b>
                      {key === "late_penalty" && current[key] > 0 ? "−" : ""}
                      {n(current[key])} <small>{unit}</small>
                    </b>
                    {previous && (
                      <small
                        className={
                          delta == null ? "" : good ? "delta-good" : "delta-bad"
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
                <h3>Xu hướng KPI · 6 tháng</h3>
                <div
                  className="kpi-trend"
                  role="img"
                  aria-label={report.trend
                    .map((r) => r.period + ": " + n(r.kpi))
                    .join("; ")}
                >
                  {report.trend.map((r) => (
                    <div key={r.period}>
                      <b>{n(r.kpi)}</b>
                      <div className="kpi-trend-track">
                        <span style={{ height: (r.kpi || 0) * 10 + "%" }} />
                      </div>
                      <small>{r.period}</small>
                    </div>
                  ))}
                </div>
                <p>
                  KPI thang 10 · Chưa có điểm chấm hiển thị “—”, không tính là
                  0.
                </p>
              </article>
              <article className="kpi-analysis-panel">
                <h3>Phân bổ điểm bị mất</h3>
                <strong className="kpi-loss-total">{n(loss)} điểm</strong>
                {report.losses.map((r) => (
                  <div className="kpi-loss-row" key={r.name}>
                    <div>
                      <span>{r.name}</span>
                      <b>
                        {n(r.points)} điểm ·{" "}
                        {loss ? n((r.points / loss) * 100) : 0}%
                      </b>
                    </div>
                    <div className="kpi-loss-track">
                      <span
                        style={{
                          width: (loss ? (r.points / loss) * 100 : 0) + "%",
                        }}
                      />
                    </div>
                  </div>
                ))}
                <p>
                  Chưa có mã nguyên nhân để tách giảm điểm chấm thành thiếu yêu
                  cầu, chỉnh sửa hay khác. Yêu cầu làm lại không tự động đồng
                  nghĩa với bị trừ điểm.
                </p>
              </article>
            </section>
            <article className="kpi-analysis-panel">
              <h3>
                KPI theo tổ <small>Bấm vào tổ để xem giáo viên</small>
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
                        {d.teachers} giáo viên · Trừ trễ hạn:{" "}
                        {n(d.late_penalty)} điểm
                      </small>
                    </span>
                    <b>
                      {n(d.kpi)} / 10 <ArrowRight size={16} />
                    </b>
                  </button>
                ))}
                {!report.departments.length && (
                  <p>Không có dữ liệu tổ phù hợp.</p>
                )}
              </div>
            </article>
            <section className="kpi-table-card">
              <div className="kpi-filters">
                <h3>Kết quả giáo viên</h3>
                <span className="kpi-result-count">
                  {report.data.length} giáo viên
                </span>
              </div>
              <div className="kpi-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Giáo viên</th>
                      <th>Tổ chuyên môn</th>
                      <th>Công việc</th>
                      <th>Điểm đạt / tối đa</th>
                      <th>KPI / 10</th>
                      <th>Trừ trễ hạn</th>
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
                        <td>{r.department || "Chưa phân tổ"}</td>
                        <td>{r.task_count}</td>
                        <td>
                          {n(r.task_earned)} / {n(r.task_maximum)}
                        </td>
                        <td>
                          <strong className="kpi-total">
                            {n(r.final_score)}
                          </strong>
                        </td>
                        <td className={r.late_penalty > 0 ? "delta-bad" : ""}>
                          {n(r.late_penalty)} điểm
                        </td>
                      </tr>
                    ))}
                    {!report.data.length && (
                      <tr>
                        <td colSpan="6" className="kpi-empty">
                          Không có giáo viên phù hợp.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="kpi-methodology">
              KPI: trung bình giáo viên có điểm, tính điểm đạt / tối đa × 10.
              Hoàn thành: công việc có hạn trong tháng. Đúng hạn: lần nộp cuối
              (hoặc thời điểm hoàn thành nếu không có bản nộp) không vượt hạn.
              Duyệt lần đầu: công việc có bản nộp được xét duyệt trong kỳ, bản
              nộp đầu được chấp thuận. Điểm trừ: kết quả chấm mới nhất của công
              việc hoàn thành trong kỳ.
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
                    <small>
                      {t.task_type || "Chưa có loại nhiệm vụ"}
                      {t.product && " · " + t.product}
                    </small>
                    <small>
                      {{
                        not_started: "Chưa làm",
                        in_progress: "Đang thực hiện",
                        completed: "Hoàn thành",
                      }[t.status] || t.status}{" "}
                      · Hạn:{" "}
                      {t.due_at
                        ? new Date(t.due_at).toLocaleString("vi-VN")
                        : "—"}
                    </small>
                    {t.comment && <small>Nhận xét: {t.comment}</small>}
                    {t.revision_count > 0 && (
                      <small>Yêu cầu làm lại: {t.revision_count} lần</small>
                    )}
                  </div>
                  <div className="kpi-task-score">
                    <b>
                      {t.score == null
                        ? "Chưa có điểm trong kỳ"
                        : n(t.score) + " / " + n(t.maximum_score) + " điểm"}
                    </b>
                    {t.late_penalty > 0 && (
                      <small>
                        Trễ hạn: trừ {n(t.late_penalty_percent)}% ={" "}
                        {n(t.late_penalty)} điểm
                      </small>
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
