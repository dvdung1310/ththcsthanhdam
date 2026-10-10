import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { schoolYearLabel, schoolYearOf } from "./evaluationUtils";
import "./EvaluationPeriodPicker.css";

const MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];
const parse = (value) => value.split("-").map(Number);
const keyOf = (year, month) => `${year}-${String(month).padStart(2, "0")}`;
const shift = (value, step) => {
  const [year, month] = parse(value);
  const date = new Date(year, month - 1 + step, 1);
  return keyOf(date.getFullYear(), date.getMonth() + 1);
};

export default function MonthPicker({ value, onChange, maxAhead = 2 }) {
  const [year, month] = parse(value);
  const [open, setOpen] = useState(false);
  const [schoolYear, setSchoolYear] = useState(schoolYearOf(year, month));
  const ref = useRef(null);
  const now = new Date();
  const max = shift(keyOf(now.getFullYear(), now.getMonth() + 1), maxAhead);

  useEffect(() => {
    if (!open) return undefined;
    setSchoolYear(schoolYearOf(year, month));
    const outside = (event) => !ref.current?.contains(event.target) && setOpen(false);
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const thisMonth = keyOf(now.getFullYear(), now.getMonth() + 1);
  const maxYear = schoolYearOf(...parse(max));

  return (
    <div className="epp" ref={ref}>
      <button type="button" className="epp-step" onClick={() => onChange(shift(value, -1))} aria-label="Tháng trước">
        <ChevronLeft size={16} />
      </button>
      <button type="button" className={`dd-trigger epp-trigger ${open ? "open" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <CalendarDays size={15} />
        <span><b>Tháng {month}/{year}</b></span>
        <ChevronDown size={14} className="dd-chevron" />
      </button>
      <button type="button" className="epp-step" disabled={value >= max} onClick={() => onChange(shift(value, 1))} aria-label="Tháng sau">
        <ChevronRight size={16} />
      </button>
      {open && (
        <div className="epp-panel" role="dialog" aria-label="Chọn tháng">
          <header>
            <button type="button" onClick={() => setSchoolYear(schoolYear - 1)} aria-label="Năm học trước"><ChevronLeft size={15} /></button>
            <b>Năm học {schoolYearLabel(schoolYear)}</b>
            <button type="button" disabled={schoolYear >= maxYear} onClick={() => setSchoolYear(schoolYear + 1)} aria-label="Năm học sau"><ChevronRight size={15} /></button>
          </header>
          <div className="epp-grid">
            {MONTHS.map((item) => {
              const key = keyOf(item >= 8 ? schoolYear : schoolYear + 1, item);
              return (
                <button
                  key={item}
                  type="button"
                  className={`${key === value ? "selected" : ""} ${key === thisMonth ? "today" : ""}`}
                  disabled={key > max}
                  onClick={() => {
                    setOpen(false);
                    onChange(key);
                  }}
                >
                  <b>T{item}</b>
                </button>
              );
            })}
          </div>
          {value !== thisMonth && (
            <footer>
              <button type="button" className="epp-today" onClick={() => { setOpen(false); onChange(thisMonth); }}>Về tháng hiện tại</button>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}
