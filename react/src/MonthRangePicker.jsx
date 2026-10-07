import { useEffect, useRef, useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import "./MonthRangePicker.css";

const MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];
const keyOf = (schoolYear, month) => `${month >= 8 ? schoolYear : schoolYear + 1}-${String(month).padStart(2, "0")}`;
const labelOf = (key) => {
  const [year, month] = key.split("-").map(Number);
  return `T${month}/${year}`;
};

function presetsFor(allYears, schoolYear, periods) {
  const official = periods.filter((period) => period.official);
  const latest = (official.at(-1) ?? periods.at(-1))?.key;
  const base = allYears
    ? [{ key: "all", label: "Tất cả các tháng", from: "", to: "" }]
    : [
        { key: "year", label: "Cả năm học", from: "", to: "" },
        { key: "hk1", label: "Học kỳ I", from: `${schoolYear}-08`, to: `${schoolYear}-12` },
        { key: "hk2", label: "Học kỳ II", from: `${schoolYear + 1}-01`, to: `${schoolYear + 1}-05` },
      ];
  return latest ? [...base, { key: "latest", label: "Tháng gần nhất", from: latest, to: latest }] : base;
}

export default function MonthRangePicker({ periods, allYears, schoolYear, from, to, onChange }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [mode, setMode] = useState("start");
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => !ref.current?.contains(event.target) && setOpen(false);
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(() => {
    if (!open) {
      setPending(null);
      setMode("start");
      setHover(null);
    }
  }, [open]);

  const byKey = new Map(periods.map((period) => [period.key, period]));
  const presets = presetsFor(allYears, schoolYear, periods);
  const preset = presets.find((item) => item.from === from && item.to === to);
  const years = allYears ? [...new Set(periods.map((period) => period.school_year))].sort((a, b) => a - b) : schoolYear != null ? [schoolYear] : [];
  const first = periods[0]?.key ?? "";
  const last = periods.at(-1)?.key ?? "";
  const start = from || first;
  const end = to || last;
  const range = start && end ? (start === end ? labelOf(start) : `${labelOf(start)} → ${labelOf(end)}`) : "Chưa có tháng";

  const apply = (next) => {
    onChange(next);
    setOpen(false);
  };
  const finish = (a, b) => {
    const [low, high] = a <= b ? [a, b] : [b, a];
    apply({ from: low === first ? "" : low, to: high === last ? "" : high });
  };
  const pick = (key) => {
    if (mode === "start") {
      setPending(key);
      setMode("end");
      return;
    }
    finish(pending ?? start, key);
  };
  const editEnd = () => {
    setPending(start);
    setMode("end");
  };
  const editStart = () => {
    setPending(null);
    setMode("start");
  };
  const previewStart = mode === "end" ? pending ?? start : start;
  const previewEnd = mode === "end" ? hover ?? (pending ? null : end) : end;
  const [low, high] = previewStart && previewEnd ? (previewStart <= previewEnd ? [previewStart, previewEnd] : [previewEnd, previewStart]) : [previewStart, previewStart];

  return (
    <div className="mrp" ref={ref}>
      <button type="button" className={`dd-trigger ${open ? "open" : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-label="Khoảng thời gian" onClick={() => setOpen(!open)}>
        <CalendarRange size={15} />
        <span>
          {preset && <b>{preset.label}</b>}
          {preset && " · "}
          {range}
        </span>
        <ChevronDown size={14} className="dd-chevron" />
      </button>
      {open && (
        <div className="mrp-panel" role="dialog" aria-label="Chọn khoảng tháng">
          <ul className="mrp-presets">
            {presets.map((item) => (
              <li key={item.key}>
                <button type="button" className={preset?.key === item.key ? "selected" : ""} onClick={() => apply({ from: item.from, to: item.to })}>
                  {item.label}
                  {preset?.key === item.key && <Check size={14} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="mrp-grids">
            <div className="mrp-slots">
              <button type="button" className={mode === "start" ? "waiting" : ""} onClick={editStart}>
                <small>Từ</small>
                <b>{labelOf(mode === "end" ? previewStart : start)}</b>
              </button>
              <span>→</span>
              <button type="button" className={mode === "end" ? "waiting" : ""} onClick={editEnd}>
                <small>Đến</small>
                <b>{mode === "end" ? (hover ? labelOf(hover) : "Chọn tháng…") : labelOf(end)}</b>
              </button>
            </div>
            {years.map((year) => (
              <section key={year}>
                <h5>Năm học {year}–{year + 1}</h5>
                <div className="mrp-grid">
                  {MONTHS.map((month) => {
                    const key = keyOf(year, month);
                    const period = byKey.get(key);
                    const inRange = low && key >= low && key <= high;
                    const isStart = key === low;
                    const isEnd = key === high && high !== low;
                    const tag = isStart && isEnd ? null : isStart ? "Từ" : isEnd ? "Đến" : null;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!period}
                        className={[inRange && "in-range", isStart && "edge start", isEnd && "edge end", mode === "end" && "choosing"].filter(Boolean).join(" ")}
                        title={period ? `${labelOf(key)} · ${period.official ? "đã công bố" : "chưa công bố"}` : `${labelOf(key)} · chưa có kỳ đánh giá`}
                        onMouseEnter={() => mode === "end" && period && setHover(key)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => pick(key)}
                      >
                        T{month}
                        {tag ? <em>{tag}</em> : <i className={period?.official ? "official" : period ? "pending" : ""} />}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            <p className="mrp-hint">
              {mode === "end" ? "Bấm tháng kết thúc" : "Bấm tháng bắt đầu"}
              <span><i className="official" /> đã công bố <i className="pending" /> chưa công bố</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
