import { useEffect, useRef, useState } from "react";
import { CalendarDays, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { schoolYearLabel, schoolYearOf } from "./evaluationUtils";
import "./EvaluationPeriodPicker.css";

const MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];
const order = (period) => period.year * 100 + period.month;
const yearOfMonth = (schoolYear, month) => (month >= 8 ? schoolYear : schoolYear + 1);

export default function EvaluationPeriodPicker({ periods, value, canManage, onChange, onOpenNew }) {
  const sorted = [...periods].sort((a, b) => order(a) - order(b));
  const current = sorted.find((period) => period.id === value) ?? sorted.at(-1);
  const index = sorted.indexOf(current);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => (current ? schoolYearOf(current.year, current.month) : schoolYearOf(new Date().getFullYear(), new Date().getMonth() + 1)));
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    if (current) setYear(schoolYearOf(current.year, current.month));
    const outside = (event) => !ref.current?.contains(event.target) && setOpen(false);
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = [...new Set(sorted.map((period) => schoolYearOf(period.year, period.month)))];
  const now = new Date();
  const thisYear = schoolYearOf(now.getFullYear(), now.getMonth() + 1);
  const minYear = Math.min(...years, thisYear);
  const maxYear = Math.max(...years, thisYear);
  const limit = now.getFullYear() * 100 + now.getMonth() + 2;
  const find = (schoolYear, month) => sorted.find((period) => period.year === yearOfMonth(schoolYear, month) && period.month === month);

  return (
    <div className="epp" ref={ref}>
      <button type="button" className="epp-step" disabled={index <= 0} onClick={() => onChange(sorted[index - 1].id)} aria-label="Kỳ trước" title={index > 0 ? sorted[index - 1].label : undefined}>
        <ChevronLeft size={16} />
      </button>
      <button type="button" className={`dd-trigger epp-trigger ${open ? "open" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <CalendarDays size={15} />
        <span>
          <b>{current?.label ?? "Chọn kỳ"}</b>
          {current && <i className={`epp-dot ${current.status}`} />}
        </span>
        <ChevronDown size={14} className="dd-chevron" />
      </button>
      <button type="button" className="epp-step" disabled={index < 0 || index >= sorted.length - 1} onClick={() => onChange(sorted[index + 1].id)} aria-label="Kỳ sau" title={index < sorted.length - 1 ? sorted[index + 1]?.label : undefined}>
        <ChevronRight size={16} />
      </button>
      {open && (
        <div className="epp-panel" role="dialog" aria-label="Chọn kỳ đánh giá">
          <header>
            <button type="button" disabled={year <= minYear} onClick={() => setYear(year - 1)} aria-label="Năm học trước"><ChevronLeft size={15} /></button>
            <b>Năm học {schoolYearLabel(year)}</b>
            <button type="button" disabled={year >= maxYear} onClick={() => setYear(year + 1)} aria-label="Năm học sau"><ChevronRight size={15} /></button>
          </header>
          <div className="epp-grid">
            {MONTHS.map((month) => {
              const period = find(year, month);
              const calendarYear = yearOfMonth(year, month);
              const openable = !period && canManage && calendarYear * 100 + month <= limit;
              return (
                <button
                  key={month}
                  type="button"
                  className={`${period ? period.status : "none"} ${period && period.id === current?.id ? "selected" : ""} ${openable ? "openable" : ""}`}
                  disabled={!period && !openable}
                  title={period ? `${period.label} · ${period.status_label}` : openable ? `Mở kỳ Tháng ${month}/${calendarYear}` : `Tháng ${month}/${calendarYear} chưa mở`}
                  onClick={() => {
                    setOpen(false);
                    if (period) onChange(period.id);
                    else onOpenNew(calendarYear, month);
                  }}
                >
                  <b>T{month}</b>
                  {period ? <i className={`epp-dot ${period.status}`} /> : openable ? <CalendarPlus size={12} /> : <i className="epp-dot none" />}
                </button>
              );
            })}
          </div>
          <footer>
            <span><i className="epp-dot open" /> Đang chấm</span>
            <span><i className="epp-dot disclosed" /> Chờ giải trình</span>
            <span><i className="epp-dot published" /> Đã công bố</span>
            {canManage && <span><CalendarPlus size={11} /> Bấm để mở kỳ</span>}
          </footer>
        </div>
      )}
    </div>
  );
}
