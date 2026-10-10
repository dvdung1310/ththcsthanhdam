import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, CalendarClock, ChevronRight, ListChecks, RotateCcw, Search, X } from "lucide-react";
import TablePagination, { usePagination } from "./TablePagination";
import "./TaskStatsPeople.css";

const collator = new Intl.Collator("vi", { sensitivity: "base" });
const fold = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const lastName = (name) => String(name ?? "").trim().split(/\s+/).pop();
const percent = (value) => (value == null ? "—" : `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`);

const QUICK = [
  ["", "Tất cả", () => true],
  ["overdue", "Có việc quá hạn", (row) => row.overdue > 0],
  ["waiting", "Có việc chờ duyệt", (row) => row.waiting > 0],
  ["low", "Hoàn thành dưới 50%", (row) => row.completion_rate != null && row.completion_rate < 50],
  ["empty", "Chưa có việc", (row) => row.assigned === 0],
];

const COLUMNS = [
  ["employee", "Nhân sự", (a, b) => collator.compare(lastName(a.employee), lastName(b.employee)) || collator.compare(a.employee ?? "", b.employee ?? "")],
  ["unit", "Tổ / nhóm", (a, b) => collator.compare(a.units?.[0]?.name ?? "~", b.units?.[0]?.name ?? "~")],
  ["assigned", "Công việc"],
  ["completed", "Hoàn thành"],
  ["waiting", "Chờ duyệt"],
  ["overdue", "Quá hạn"],
  ["completion_rate", "Tỷ lệ hoàn thành"],
  ["on_time_rate", "Đúng hạn"],
];

export const TASK_STATUS = {
  not_started: ["Chưa thực hiện", "muted"],
  in_progress: ["Đang thực hiện", "blue"],
  waiting_approval: ["Chờ duyệt", "orange"],
  completed: ["Hoàn thành", "green"],
};

const isOverdue = (task) => ["not_started", "in_progress"].includes(task.status) && task.due_at && new Date(task.due_at) < new Date();

export default function TaskStatsPeople({ rows, period, onUnit, onOpen }) {
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState("");
  const [sort, setSort] = useState({ key: "assigned", desc: true });
  const keyword = fold(search.trim());

  const searched = useMemo(() => rows.filter((row) => !keyword || fold(`${row.employee} ${row.employee_code}`).includes(keyword)), [rows, keyword]);
  const counts = useMemo(() => Object.fromEntries(QUICK.map(([key, , test]) => [key, searched.filter(test).length])), [searched]);
  const visible = useMemo(() => {
    const test = QUICK.find(([key]) => key === quick)?.[2] ?? (() => true);
    const column = COLUMNS.find(([key]) => key === sort.key);
    const compare = column?.[2] ?? ((a, b) => (a[sort.key] ?? -1) - (b[sort.key] ?? -1));
    const sign = sort.desc ? -1 : 1;
    return searched.filter(test).sort((a, b) => sign * compare(a, b) || collator.compare(a.employee ?? "", b.employee ?? ""));
  }, [searched, quick, sort]);

  const pager = usePagination(visible, 20);
  useEffect(() => pager.reset(), [keyword, quick, sort.key, sort.desc, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const sortBy = (key) => setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: !["employee", "unit"].includes(key) }));

  return (
    <section className="kpi-table-card tsp-card">
      <header className="tsp-head">
        <div>
          <h3>Theo nhân sự</h3>
          <small>Tháng {period} · bấm một dòng để xem danh sách công việc</small>
        </div>
        <label className="tsp-search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hoặc mã nhân sự..." />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Xóa tìm kiếm"><X size={14} /></button>}
        </label>
      </header>
      <div className="tsp-chips" role="group" aria-label="Lọc nhanh">
        {QUICK.map(([key, label]) => (
          <button key={key} type="button" className={`${quick === key ? "active" : ""} ${key === "overdue" && counts[key] ? "alert" : ""}`} onClick={() => setQuick(key)}>
            {label} <em>{counts[key]}</em>
          </button>
        ))}
      </div>
      <div className="kpi-table-wrap tsp-wrap">
        <table className="tsp-table">
          <thead>
            <tr>
              {COLUMNS.map(([key, label]) => (
                <th key={key} className={`${["employee", "unit"].includes(key) ? "" : "num"} ${sort.key === key ? "sorted" : ""}`} onClick={() => sortBy(key)} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
                  <span>
                    {label}
                    {sort.key === key && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                  </span>
                </th>
              ))}
              <th aria-label="Xem công việc" />
            </tr>
          </thead>
          <tbody>
            {pager.rows.map((row) => (
              <tr key={row.employee_id} onClick={() => onOpen(row)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpen(row)}>
                <td>
                  <span className="tsp-person">
                    <b>{row.employee}</b>
                    <small>{row.employee_code}</small>
                  </span>
                </td>
                <td className="tsp-units">
                  {row.units?.length ? (
                    row.units.map((unit) => (
                      <button key={unit.id} type="button" title={`Lọc thống kê theo ${unit.path}`} onClick={(event) => { event.stopPropagation(); onUnit(unit.id); }}>
                        {unit.name}
                      </button>
                    ))
                  ) : (
                    <span className="tsp-muted">Chưa thuộc đơn vị</span>
                  )}
                </td>
                <td className="num"><Count value={row.assigned} /></td>
                <td className="num"><Count value={row.completed} /></td>
                <td className="num"><Count value={row.waiting} tone="warn" /></td>
                <td className="num"><Count value={row.overdue} tone="bad" /></td>
                <td className="num">
                  <span className="tsp-rate">
                    <i><span style={{ width: `${row.completion_rate ?? 0}%` }} className={row.completion_rate != null && row.completion_rate < 50 ? "low" : ""} /></i>
                    <b>{percent(row.completion_rate)}</b>
                  </span>
                </td>
                <td className="num">{percent(row.on_time_rate)}</td>
                <td className="tsp-open">
                  <span><ListChecks size={14} /> Xem việc <ChevronRight size={14} /></span>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="kpi-empty">{rows.length ? "Không có nhân sự phù hợp bộ lọc." : "Không có nhân sự trong phạm vi."}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="tsp-foot">
        <span>
          <b>{visible.length}</b> / {rows.length} nhân sự
        </span>
        <TablePagination pager={pager} noun="nhân sự" sizes={[20, 50, 100]} showRange={false} />
      </footer>
    </section>
  );
}

function Count({ value, tone }) {
  if (!value) return <span className="tsp-zero">0</span>;
  return <b className={tone ? `tsp-${tone}` : ""}>{value}</b>;
}

const TABS = [
  ["", "Tất cả", () => true],
  ["open", "Đang làm", (task) => ["not_started", "in_progress"].includes(task.status) && !isOverdue(task)],
  ["overdue", "Quá hạn", isOverdue],
  ["waiting", "Chờ duyệt", (task) => task.status === "waiting_approval"],
  ["completed", "Hoàn thành", (task) => task.status === "completed"],
];

export function PersonTasksDialog({ person, period, onClose, onTask }) {
  const [tab, setTab] = useState("");
  useEffect(() => {
    const escape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  const tasks = useMemo(() => [...person.tasks].sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? "")), [person.tasks]);
  const shown = tasks.filter(TABS.find(([key]) => key === tab)?.[2] ?? (() => true));
  const metrics = [
    ["Công việc", person.assigned],
    ["Hoàn thành", person.completed, "good"],
    ["Chờ duyệt", person.waiting, "warn"],
    ["Quá hạn", person.overdue, person.overdue ? "bad" : ""],
    ["Tỷ lệ hoàn thành", percent(person.completion_rate)],
    ["Đúng hạn", percent(person.on_time_rate)],
  ];

  return createPortal(
    <div className="tsp-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="tsp-dialog" role="dialog" aria-modal="true" aria-label={`Công việc của ${person.employee}`}>
        <header>
          <div>
            <h3>{person.employee}</h3>
            <p>
              {[person.employee_code, person.units?.map((unit) => unit.name).join(", ")].filter(Boolean).join(" · ")}
              <span className="tsp-period"><CalendarClock size={13} /> Việc có hạn trong tháng {period}</span>
            </p>
          </div>
          <button type="button" className="tsp-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </header>
        <div className="tsp-metrics">
          {metrics.map(([label, value, tone]) => (
            <div key={label} className={tone ? `tsp-metric-${tone}` : ""}>
              <small>{label}</small>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <div className="tsp-tabs" role="tablist">
          {TABS.map(([key, label, test]) => {
            const count = tasks.filter(test).length;
            return (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} disabled={key !== "" && !count} onClick={() => setTab(key)}>
                {label} <em>{count}</em>
              </button>
            );
          })}
        </div>
        <div className="tsp-list">
          {shown.map((task) => {
            const [label, tone] = TASK_STATUS[task.status] ?? [task.status, "muted"];
            const overdue = isOverdue(task);
            return (
              <article key={task.id}>
                <div className="tsp-task-main">
                  <span className="tsp-task-top">
                    <code>{task.code}</code>
                    <span className={`tsp-status ${overdue ? "red" : tone}`}>{overdue ? "Quá hạn" : label}</span>
                    {task.status === "completed" && <span className={`tsp-flag ${task.is_late ? "late" : "ok"}`}>{task.is_late ? "Hoàn thành trễ" : "Đúng hạn"}</span>}
                    {task.revision_count > 0 && <span className="tsp-flag late"><RotateCcw size={11} /> Làm lại {task.revision_count} lần</span>}
                  </span>
                  <b title={task.title}>{task.title}</b>
                  <small>
                    {task.category || "Chưa có loại nhiệm vụ"} · Hạn {task.due_at ? new Date(task.due_at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "không thời hạn"}
                  </small>
                </div>
                {onTask && (
                  <button type="button" className="tsp-task-open" onClick={() => onTask(task.code)}>
                    Mở <ChevronRight size={14} />
                  </button>
                )}
              </article>
            );
          })}
          {!shown.length && <p className="tsp-empty">{tasks.length ? "Không có công việc ở mục này." : "Không có công việc có hạn trong tháng này."}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
