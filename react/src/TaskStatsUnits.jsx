import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronRight, TriangleAlert, X } from "lucide-react";
import "./TaskStatsPeople.css";

const collator = new Intl.Collator("vi", { sensitivity: "base" });
const number = (value) => Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const percent = (value) => (value == null ? "—" : `${number(value)}%`);
const openOf = (unit) => Math.max(0, unit.assigned - unit.completed - unit.waiting - unit.overdue);

const SORTS = [
  ["attention", "Cần chú ý", (a, b) => b.overdue / (b.assigned || 1) - a.overdue / (a.assigned || 1) || (a.completion_rate ?? 101) - (b.completion_rate ?? 101)],
  ["rate", "Hoàn thành", (a, b) => (b.completion_rate ?? -1) - (a.completion_rate ?? -1)],
  ["overdue", "Quá hạn", (a, b) => b.overdue - a.overdue],
  ["assigned", "Số việc", (a, b) => b.assigned - a.assigned],
];

const SEGMENTS = [
  ["completed", "Hoàn thành", (unit) => unit.completed],
  ["waiting", "Chờ duyệt", (unit) => unit.waiting],
  ["open", "Đang làm / chưa đến hạn", openOf],
  ["overdue", "Quá hạn", (unit) => unit.overdue],
];

export default function TaskStatsUnits({ units, schoolRate, comparison, selectedId, selectedName, onSelect, onClear }) {
  const [sort, setSort] = useState("attention");
  const [expanded, setExpanded] = useState(() => new Set());
  const compare = SORTS.find(([key]) => key === sort)[2];
  const order = (list) => [...list].sort((a, b) => compare(a, b) || collator.compare(a.short_name ?? a.name, b.short_name ?? b.name));
  const { roots, childrenOf } = useMemo(() => {
    const map = {};
    units.forEach((unit) => unit.parent_id && (map[unit.parent_id] ||= []).push(unit));
    return { roots: units.filter((unit) => !unit.parent_id), childrenOf: map };
  }, [units]);
  useEffect(() => {
    const parent = units.find((unit) => unit.id === selectedId)?.parent_id;
    if (parent) setExpanded((current) => (current.has(parent) ? current : new Set([...current, parent])));
  }, [selectedId, units]);
  const flagged = (unit) => unit.assigned > 0 && (unit.overdue / unit.assigned >= 0.2 || (schoolRate != null && unit.completion_rate != null && unit.completion_rate <= schoolRate - 10));
  const toggle = (id) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const row = (unit, depth) => {
    const kids = childrenOf[unit.id] ?? [];
    const open = expanded.has(unit.id);
    const delta = unit.previous?.completion_rate != null && unit.completion_rate != null ? Math.round((unit.completion_rate - unit.previous.completion_rate) * 10) / 10 : null;
    return (
      <Fragment key={unit.id}>
        <tr className={`${selectedId === unit.id ? "selected" : ""} ${depth ? "child" : ""}`} onClick={() => onSelect(unit.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onSelect(unit.id)} title={`Lọc thống kê theo ${unit.name}`}>
          <td>
            <span className="tsu-name" style={{ paddingLeft: depth * 22 }}>
              {kids.length ? (
                <button type="button" className={`tsu-toggle ${open ? "open" : ""}`} aria-label={open ? "Thu gọn" : `Xem ${kids.length} nhóm`} onClick={(event) => { event.stopPropagation(); toggle(unit.id); }}>
                  <ChevronRight size={14} />
                </button>
              ) : (
                <span className="tsu-toggle-gap" />
              )}
              <span>
                <b>{unit.short_name ?? unit.name}</b>
                <small>
                  {unit.employees} nhân sự{kids.length ? ` · ${kids.length} nhóm` : ""}
                </small>
              </span>
              {flagged(unit) && <em className="tsu-flag"><TriangleAlert size={11} /> Cần chú ý</em>}
            </span>
          </td>
          <td className="num">{unit.assigned || <span className="tsp-zero">0</span>}</td>
          <td>
            <span className="tsu-bar" title={SEGMENTS.map(([, label, value]) => `${label}: ${value(unit)}`).join(" · ")}>
              {unit.assigned ? SEGMENTS.map(([key, , value]) => value(unit) > 0 && <i key={key} className={key} style={{ width: `${(value(unit) / unit.assigned) * 100}%` }} />) : <i className="empty" />}
            </span>
          </td>
          <td className="num">
            <span className="tsu-rate">
              <b>{percent(unit.completion_rate)}</b>
              {comparison && <small className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>{delta == null ? "—" : delta === 0 ? "↔ 0" : `${delta > 0 ? "↑" : "↓"} ${number(Math.abs(delta))}`}</small>}
            </span>
          </td>
          <td className="num">{unit.waiting ? <b className="tsp-warn">{unit.waiting}</b> : <span className="tsp-zero">0</span>}</td>
          <td className="num">{unit.overdue ? <b className="tsp-bad">{unit.overdue}</b> : <span className="tsp-zero">0</span>}</td>
          <td className="num">{percent(unit.on_time_rate)}</td>
        </tr>
        {open && order(kids).map((kid) => row(kid, depth + 1))}
      </Fragment>
    );
  };

  return (
    <section className="kpi-table-card tsp-card tsu-card">
      <header className="tsp-head">
        <div>
          <h3>Theo tổ / nhóm</h3>
          <small>Bấm một dòng để lọc cả trang theo đơn vị · bấm ▸ để xem các nhóm</small>
        </div>
        <div className="tsu-tools">
          {selectedId && (
            <span className="tsu-active">
              Đang lọc: <b>{selectedName}</b>
              <button type="button" onClick={onClear} aria-label="Bỏ lọc đơn vị"><X size={13} /></button>
            </span>
          )}
          <div className="tsu-sort" role="group" aria-label="Sắp xếp">
            {SORTS.map(([key, label]) => (
              <button key={key} type="button" className={sort === key ? "active" : ""} onClick={() => setSort(key)}>{label}</button>
            ))}
          </div>
        </div>
      </header>
      <div className="tsu-legend">
        {SEGMENTS.map(([key, label]) => <span key={key}><i className={key} /> {label}</span>)}
      </div>
      <div className="kpi-table-wrap">
        <table className="tsp-table tsu-table">
          <thead>
            <tr>
              <th>Đơn vị</th>
              <th className="num">Công việc</th>
              <th>Tiến độ</th>
              <th className="num">Hoàn thành{comparison ? ` · so với ${comparison}` : ""}</th>
              <th className="num">Chờ duyệt</th>
              <th className="num">Quá hạn</th>
              <th className="num">Đúng hạn</th>
            </tr>
          </thead>
          <tbody>
            {order(roots).map((unit) => row(unit, 0))}
            {!units.length && (
              <tr>
                <td colSpan={7} className="kpi-empty">Không có dữ liệu đơn vị phù hợp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
