import { useCallback, useEffect, useRef, useState } from "react";
import { Columns3, RotateCcw } from "lucide-react";
import "./TaskTable.css";

export const TASK_COLUMNS = [
  { key: "task", label: "Công việc", fixed: true },
  { key: "category", label: "Loại nhiệm vụ" },
  { key: "assignees", label: "Người thực hiện" },
  { key: "reviewer", label: "Người duyệt" },
  { key: "creator", label: "Người tạo", hidden: true },
  { key: "due", label: "Thời hạn" },
  { key: "priority", label: "Ưu tiên" },
  { key: "status", label: "Trạng thái", fixed: true },
  { key: "actions", label: "Thao tác", fixed: true },
];

const STORAGE_KEY = "thanhdam_task_columns";
const defaultHidden = TASK_COLUMNS.filter((c) => c.hidden).map((c) => c.key);

export function useTaskColumns() {
  const [hidden, setHidden] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved)) return saved;
    } catch {
      return defaultHidden;
    }
    return defaultHidden;
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
  }, [hidden]);
  const columns = TASK_COLUMNS.filter((c) => c.fixed || !hidden.includes(c.key));
  return {
    columns,
    hidden,
    shows: (key) => columns.some((c) => c.key === key),
    toggle: (key) =>
      setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key])),
    reset: () => setHidden(defaultHidden),
  };
}

export function ColumnPicker({ state }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => !ref.current?.contains(event.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="column-picker" ref={ref}>
      <button type="button" className={open ? "active" : ""} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Columns3 size={15} /> Cột hiển thị
      </button>
      {open && (
        <div className="column-picker-menu" role="menu">
          {TASK_COLUMNS.map((c) => (
            <label key={c.key} className={c.fixed ? "fixed" : ""}>
              <input
                type="checkbox"
                checked={c.fixed || !state.hidden.includes(c.key)}
                disabled={c.fixed}
                onChange={() => state.toggle(c.key)}
              />
              {c.label}
            </label>
          ))}
          <button type="button" onClick={state.reset}>
            <RotateCcw size={13} /> Mặc định
          </button>
        </div>
      )}
    </div>
  );
}

export function NameStack({ items, max = 2, empty = "—" }) {
  if (!items.length) return <span className="name-stack-empty">{empty}</span>;
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  return (
    <div className="name-stack">
      {shown.map((item) => (
        <span key={item.key} className={`name-chip ${item.kind || ""}`} title={item.title || item.label}>
          {item.label}
        </span>
      ))}
      {rest.length > 0 && (
        <span className="name-chip more" title={rest.map((item) => item.title || item.label).join("\n")}>
          +{rest.length}
        </span>
      )}
    </div>
  );
}

export function useScrollEdges(deps) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 0, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update, ...deps]);
  return { ref, onScroll: update, className: `${edges.left ? "shadow-left" : ""} ${edges.right ? "shadow-right" : ""}` };
}
