import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, Info, User, X } from "lucide-react";
import { apiFetch } from "./api";
import MonthPicker from "./MonthPicker";
import UnitPicker from "./UnitPicker";
import Dropdown from "./Dropdown";
import "./KpiReport.css";
import "./KpiTaskDetails.css";
import "./KpiAnalytics.css";
import "./Evaluation.css";
import "./TaskStatsOverview.css";
import "./Skeleton.css";
import TaskStatsPeople, { PersonTasksDialog } from "./TaskStatsPeople";
import TaskStatsUnits from "./TaskStatsUnits";

const n = (v) => (v == null ? "—" : Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 1 }));
const pad = (value) => String(value).padStart(2, "0");
const SCOPES = { school: "Toàn trường", department: "Phạm vi đơn vị quản lý", self: "Cá nhân" };
const COMPARE = [
  ["previous", "So với tháng trước"],
  ["year", "So với cùng kỳ năm trước"],
  ["none", "Không so sánh"],
];
const STATUS_PARTS = [
  ["on_time", "Hoàn thành đúng hạn"],
  ["late", "Hoàn thành trễ"],
  ["waiting", "Chờ duyệt"],
  ["open", "Đang làm / chưa đến hạn"],
  ["overdue", "Quá hạn chưa nộp"],
];

export default function TaskStats({ onTask }) {
  const now = new Date();
  const [filters, setFilters] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    department_id: "",
    employee_id: "",
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
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== ""));
    apiFetch("/api/task-stats?" + params, { signal: controller.signal, silent: true })
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
  const change = (key, value) => setFilters((f) => ({ ...f, [key]: value, ...(key === "department_id" ? { employee_id: "" } : {}) }));
  const setMonth = (value) => {
    const [year, month] = value.split("-").map(Number);
    setFilters((f) => ({ ...f, year, month }));
  };

  const refs = report?.references || {};
  const current = report?.current || {};
  const previous = report?.previous;
  const departments = useMemo(() => refs.departments ?? [], [refs.departments]);
  const unitTree = useMemo(() => {
    const known = new Set(departments.map((d) => d.id));
    return {
      teams: departments.filter((d) => !d.parent_id || !known.has(d.parent_id)).map((d) => ({ id: d.id, name: d.short_name ?? d.name })),
      groups: departments.filter((d) => d.parent_id && known.has(d.parent_id)).map((d) => ({ id: d.id, name: d.short_name ?? d.name, team_id: d.parent_id })),
    };
  }, [departments]);
  const unitId = filters.department_id ? +filters.department_id : null;
  const unit = departments.find((d) => d.id === unitId);
  const pickedTeam = unit ? (unit.parent_id && unitTree.groups.some((g) => g.id === unit.id) ? unit.parent_id : unit.id) : null;
  const pickedGroup = unit && unitTree.groups.some((g) => g.id === unit.id) ? unit.id : null;
  const employees = (refs.employees ?? []).filter((t) => !unitId || t.department_ids.includes(unitId));
  const employee = refs.employees?.find((t) => t.id === +filters.employee_id);
  const category = refs.task_types?.find((t) => t.id === +filters.category_id);

  const chips = [
    unit && { key: "unit", icon: Building2, label: unit.name, clear: () => change("department_id", "") },
    employee && { key: "employee", icon: User, label: employee.name, clear: () => change("employee_id", "") },
    category && { key: "category", icon: Info, label: category.name, clear: () => change("category_id", "") },
  ].filter(Boolean);

  return (
    <div className="kpi-page kpi-analysis tso-page" aria-busy={loading}>
      <header className="tso-header">
        <div>
          <h2>Thống kê công việc</h2>
          <p>Tình hình giao, thực hiện và hoàn thành công việc theo tháng</p>
        </div>
        {report?.scope && <span className="tso-scope">{SCOPES[report.scope] ?? report.scope}</span>}
      </header>

      <section className="tso-filters">
        <MonthPicker value={`${filters.year}-${pad(filters.month)}`} onChange={setMonth} maxAhead={3} />
        <UnitPicker
          teams={unitTree.teams}
          groups={unitTree.groups}
          team={pickedTeam}
          group={pickedGroup}
          onChange={(next) => change("department_id", next.group || next.team || "")}
        />
        <Dropdown
          label="Nhân sự"
          icon={User}
          className={filters.employee_id ? "picked" : ""}
          value={filters.employee_id}
          onChange={(value) => change("employee_id", String(value))}
          options={[{ value: "", label: "Mọi nhân sự" }, { divider: true }, ...employees.map((t) => ({ value: String(t.id), label: t.name }))]}
        />
        <Dropdown
          label="Loại nhiệm vụ"
          className={filters.category_id ? "picked" : ""}
          value={filters.category_id}
          onChange={(value) => change("category_id", String(value))}
          options={[{ value: "", label: "Mọi loại nhiệm vụ" }, { divider: true }, ...(refs.task_types ?? []).map((t) => ({ value: String(t.id), label: t.name }))]}
        />
        <Dropdown
          label="So sánh"
          className="tso-compare"
          value={filters.compare}
          onChange={(value) => change("compare", String(value))}
          options={COMPARE.map(([value, label]) => ({ value, label }))}
        />
      </section>

      {report && (
        <div className="tso-chips">
          <span className={`tso-chip period ${report.in_progress ? "live" : ""}`}>
            <CalendarClock size={13} /> Tháng {report.period}
            {report.in_progress && <em>đang diễn ra · tính đến {report.as_of}</em>}
          </span>
          {chips.map((chip) => (
            <span key={chip.key} className="tso-chip">
              <chip.icon size={13} /> {chip.label}
              <button type="button" onClick={chip.clear} aria-label={`Bỏ lọc ${chip.label}`}><X size={12} /></button>
            </span>
          ))}
          {chips.length > 1 && (
            <button type="button" className="tso-clear" onClick={() => setFilters((f) => ({ ...f, department_id: "", employee_id: "", category_id: "" }))}>Xóa bộ lọc</button>
          )}
          {report.no_deadline_open > 0 && (
            <span className="tso-chip muted" title="Việc không đặt hạn không thuộc tháng nào nên không tính vào thống kê">
              <Info size={13} /> {report.no_deadline_open} việc không thời hạn đang mở
            </span>
          )}
        </div>
      )}

      {error && <div className="kpi-error">{error}</div>}
      {loading && !report ? (
        <StatsSkeleton />
      ) : (
        !error &&
        report && (
          <div className={loading ? "tso-refreshing" : ""}>
            <Cards report={report} current={current} previous={previous} />
            <StatusStrip current={current} />
            <Trend trend={report.trend} selected={`${filters.year}-${filters.month}`} onPick={(item) => setFilters((f) => ({ ...f, year: item.year, month: item.month }))} />
            <TaskStatsUnits
              units={report.departments}
              schoolRate={current.completion_rate}
              comparison={report.comparison_period}
              selectedId={unitId}
              selectedName={unit?.name}
              onSelect={(id) => change("department_id", String(id))}
              onClear={() => change("department_id", "")}
            />
            <TaskStatsPeople rows={report.data} period={report.period} onUnit={(id) => change("department_id", String(id))} onOpen={setSelected} />
            <p className="kpi-methodology">
              Thống kê theo công việc có hạn trong tháng, không tính công việc đã hủy. Công việc giao cho tổ / nhóm được tính cho mọi thành viên của đơn vị.
              Tỷ lệ hoàn thành tính trên các việc đã đến hạn hoặc đã hoàn thành; với tháng đang diễn ra, phần so sánh lấy cùng khoảng ngày của kỳ trước.
              Đúng hạn: lần nộp cuối (hoặc thời điểm hoàn thành nếu không có bản nộp) không vượt hạn.
            </p>
          </div>
        )
      )}
      {selected && <PersonTasksDialog person={selected} period={report.period} onClose={() => setSelected(null)} onTask={onTask} />}
    </div>
  );
}

function Cards({ report, current, previous }) {
  const delta = (key) => (previous?.[key] != null && current[key] != null ? Math.round((current[key] - previous[key]) * 10) / 10 : null);
  const cards = [
    {
      key: "assigned",
      label: "Công việc có hạn trong tháng",
      value: n(current.assigned),
      unit: "việc",
      note: report.in_progress ? `${n(current.due)} việc đã đến hạn hoặc đã xong` : null,
      tone: "neutral",
    },
    { key: "completion_rate", label: "Tỷ lệ hoàn thành", value: n(current.completion_rate), unit: "%", percent: true, note: `${n(current.completed)}/${n(current.due)} việc`, tone: "higher" },
    { key: "on_time_rate", label: "Hoàn thành đúng hạn", value: n(current.on_time_rate), unit: "%", percent: true, note: `${n(current.on_time)}/${n(current.completed)} việc đã xong`, tone: "higher" },
    { key: "overdue", label: "Quá hạn chưa nộp", value: n(current.overdue), unit: "việc", note: current.waiting ? `${n(current.waiting)} việc đang chờ duyệt` : null, tone: "lower", alert: current.overdue > 0 },
  ];
  return (
    <section className="tso-cards">
      {cards.map((card) => {
        const change = delta(card.key);
        const good = card.tone === "higher" ? change > 0 : change < 0;
        const tone = change == null || change === 0 || card.tone === "neutral" ? "" : good ? "delta-good" : "delta-bad";
        return (
          <article key={card.key} className={card.alert ? "alert" : ""}>
            <span>{card.label}</span>
            <b>
              {card.value} <small>{card.unit}</small>
            </b>
            {card.note && <small className="tso-note">{card.note}</small>}
            {previous && (
              <small className={`tso-delta ${tone}`}>
                {change == null
                  ? `Chưa có dữ liệu ${report.comparison_period}`
                  : `${change > 0 ? "↑" : change < 0 ? "↓" : "↔"} ${n(Math.abs(change))}${card.percent ? " điểm %" : ""} so với ${report.comparison_period}`}
              </small>
            )}
          </article>
        );
      })}
    </section>
  );
}

function StatusStrip({ current }) {
  const total = current.assigned || 0;
  return (
    <section className="kpi-analysis-panel tso-strip">
      <header>
        <h3>Tình trạng công việc trong tháng</h3>
        <b>{n(total)} việc</b>
      </header>
      <div className="tso-bar" role="img" aria-label={STATUS_PARTS.map(([key, label]) => `${label}: ${current[key] ?? 0}`).join("; ")}>
        {total ? STATUS_PARTS.map(([key]) => current[key] > 0 && <i key={key} className={key} style={{ width: `${(current[key] / total) * 100}%` }} />) : null}
      </div>
      <ul className="tso-legend">
        {STATUS_PARTS.map(([key, label]) => (
          <li key={key}>
            <i className={key} />
            <span>{label}</span>
            <b>{n(current[key] ?? 0)}</b>
            <small>{total ? `${n(((current[key] ?? 0) / total) * 100)}%` : "—"}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Trend({ trend, selected, onPick }) {
  const max = Math.max(1, ...trend.map((item) => item.assigned));
  return (
    <section className="kpi-analysis-panel tso-trend">
      <header>
        <h3>6 tháng gần nhất</h3>
        <small>Chiều cao cột theo số việc có hạn · số trên cột là tỷ lệ hoàn thành · bấm cột để xem tháng đó</small>
      </header>
      <div className="tso-columns">
        {trend.map((item) => {
          const key = `${item.year}-${item.month}`;
          return (
            <button
              key={item.period}
              type="button"
              className={`${key === selected ? "selected" : ""} ${item.assigned ? "" : "empty"}`}
              onClick={() => onPick(item)}
              title={item.assigned ? STATUS_PARTS.map(([part, label]) => `${label}: ${item[part]}`).join("\n") : "Không có việc có hạn trong tháng"}
            >
              <b>{item.completion_rate == null ? "—" : `${n(item.completion_rate)}%`}</b>
              <span className="tso-column-track">
                {item.assigned ? (
                  <span className="tso-column" style={{ height: `${(item.assigned / max) * 100}%` }}>
                    {[...STATUS_PARTS].reverse().map(([part]) => item[part] > 0 && <i key={part} className={part} style={{ flexGrow: item[part] }} />)}
                  </span>
                ) : (
                  <span className="tso-column-empty" />
                )}
              </span>
              <span className="tso-column-label">
                <b>{item.period}</b>
                <small>{item.assigned} việc{item.in_progress ? " · đang diễn ra" : ""}</small>
              </span>
            </button>
          );
        })}
      </div>
      <ul className="tso-legend inline">
        {STATUS_PARTS.map(([key, label]) => (
          <li key={key}>
            <i className={key} />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatsSkeleton() {
  const bar = (width, height = 12, extra = {}) => <i className="sk" style={{ width, height, ...extra }} />;
  return (
    <div className="tso-skeleton" aria-busy="true" aria-label="Đang tải thống kê">
      <div className="tso-chips">
        {bar(150, 28, { borderRadius: 99 })}
        {bar(190, 28, { borderRadius: 99 })}
      </div>
      <section className="tso-cards">
        {Array.from({ length: 4 }, (_, index) => (
          <article key={index}>
            {bar("55%", 13)}
            {bar("40%", 28)}
            {bar("70%")}
            {bar("80%")}
          </article>
        ))}
      </section>
      <section className="kpi-analysis-panel tso-strip">
        {bar(220, 16)}
        {bar("100%", 14, { borderRadius: 99 })}
        <div className="tso-sk-row">{Array.from({ length: 5 }, (_, index) => <span key={index}>{bar("70%")}{bar("40%", 18)}</span>)}</div>
      </section>
      <section className="kpi-analysis-panel tso-trend">
        {bar(160, 16)}
        <div className="tso-sk-columns">
          {[55, 85, 45, 115, 75, 150].map((height, index) => (
            <span key={index}>
              {bar(56, height, { borderRadius: "7px 7px 3px 3px" })}
              {bar(48, 11)}
            </span>
          ))}
        </div>
      </section>
      {[0, 1].map((table) => (
        <section key={table} className="kpi-table-card tso-sk-table">
          <header>{bar(180, 16)}{bar(240, 32, { borderRadius: 9 })}</header>
          {Array.from({ length: 6 }, (_, row) => (
            <div key={row} className="tso-sk-line">
              {bar("22%", 14)}
              {bar("12%")}
              {bar("30%", 10, { borderRadius: 99 })}
              {bar("10%")}
              {bar("8%")}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
