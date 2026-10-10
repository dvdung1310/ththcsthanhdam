import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, TriangleAlert, X } from "lucide-react";
import "./TaskStatsPeople.css";

const collator = new Intl.Collator("vi", { sensitivity: "base" });
const number = (value) => Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const percent = (value) => (value == null ? "—" : `${number(value)}%`);
const openOf = (unit) => Math.max(0, unit.assigned - unit.completed - unit.waiting - unit.overdue);

const attention = (a, b) => b.overdue / (b.assigned || 1) - a.overdue / (a.assigned || 1) || (a.completion_rate ?? 101) - (b.completion_rate ?? 101);
const byValue = (pick) => (a, b) => (pick(a) ?? -1) - (pick(b) ?? -1);
const COLUMNS = [
  ["name", "Đơn vị", "", (a, b) => collator.compare(a.short_name ?? a.name, b.short_name ?? b.name)],
  ["assigned", "Công việc", "num", byValue((unit) => unit.assigned)],
  ["progress", "Tiến độ", "", byValue((unit) => (unit.assigned ? (unit.completed + unit.waiting) / unit.assigned : null))],
  ["rate", "Hoàn thành", "num", byValue((unit) => unit.completion_rate)],
  ["waiting", "Chờ duyệt", "num", byValue((unit) => unit.waiting)],
  ["overdue", "Quá hạn", "num", byValue((unit) => unit.overdue)],
  ["on_time", "Đúng hạn", "num", byValue((unit) => unit.on_time_rate)],
];

const SEGMENTS = [
  ["completed", "Hoàn thành", (unit) => unit.completed],
  ["waiting", "Chờ duyệt", (unit) => unit.waiting],
  ["open", "Đang làm / chưa đến hạn", openOf],
  ["overdue", "Quá hạn", (unit) => unit.overdue],
];

export default function TaskStatsUnits({ units, schoolRate, comparison, selectedId, selectedName, onSelect, onClear }) {
  const [sort, setSort] = useState({ key: "attention", desc: false });
  const [expanded, setExpanded] = useState(() => new Set());
  const compare = sort.key === "attention" ? attention : COLUMNS.find(([key]) => key === sort.key)[3];
  const sign = sort.key !== "attention" && sort.desc ? -1 : 1;
  const order = (list) => [...list].sort((a, b) => sign * compare(a, b) || collator.compare(a.short_name ?? a.name, b.short_name ?? b.name));
  const sortBy = (key) => setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key !== "name" }));
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
          <small>Bấm một dòng để lọc cả trang theo đơn vị · bấm ▸ để xem các nhóm · bấm tiêu đề cột để sắp xếp</small>
        </div>
        <div className="tsu-tools">
          {selectedId && (
            <span className="tsu-active">
              Đang lọc: <b>{selectedName}</b>
              <button type="button" onClick={onClear} aria-label="Bỏ lọc đơn vị"><X size={13} /></button>
            </span>
          )}
          <button type="button" className={`tsu-attention ${sort.key === "attention" ? "active" : ""}`} onClick={() => setSort({ key: "attention", desc: false })} title="Đưa đơn vị nhiều việc quá hạn, tỷ lệ hoàn thành thấp lên đầu">
            <TriangleAlert size={13} /> Ưu tiên cần chú ý
          </button>
        </div>
      </header>
      <div className="tsu-legend">
        {SEGMENTS.map(([key, label]) => <span key={key}><i className={key} /> {label}</span>)}
      </div>
      <div className="kpi-table-wrap">
        <table className="tsp-table tsu-table">
          <thead>
            <tr>
              {COLUMNS.map(([key, label, align]) => (
                <th key={key} className={`${align} ${sort.key === key ? "sorted" : ""}`} onClick={() => sortBy(key)} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
                  <span>
                    {label}
                    {key === "rate" && comparison ? ` · so với ${comparison}` : ""}
                    {sort.key === key && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                  </span>
                </th>
              ))}
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
