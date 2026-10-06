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
  { key: "completed", label: "Hoàn thành lúc", hidden: true },
  { key: "priority", label: "Ưu tiên" },
  { key: "status", label: "Trạng thái", fixed: true },
  { key: "actions", label: "Thao tác", fixed: true },
];

const STORAGE_KEY = "thanhdam_task_columns";
const defaultHidden = TASK_COLUMNS.filter((c) => c.hidden).map((c) => c.key);
const LEGACY_KEYS = ["task", "category", "assignees", "reviewer", "creator", "due", "priority", "status", "actions"];

export function useTaskColumns() {
  const [hidden, setHidden] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const legacy = Array.isArray(saved);
      const list = legacy ? saved : saved?.hidden;
      if (!Array.isArray(list)) return defaultHidden;
      const seen = legacy ? LEGACY_KEYS : saved.seen || [];
      return [...list, ...defaultHidden.filter((key) => !seen.includes(key) && !list.includes(key))];
    } catch {
      return defaultHidden;
    }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hidden, seen: TASK_COLUMNS.map((c) => c.key) }));
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

const chipTones = ["#1f4e79", "#3b6e96", "#2f7a5b", "#946a2e", "#8a4b5c", "#44737e"];

export function NameStack({ items, max = 2, empty = "—", details, title }) {
  const [anchor, setAnchor] = useState(null);
  const popoverRef = useRef(null);
  useEffect(() => {
    if (!anchor) return undefined;
    const close = (event) => !popoverRef.current?.contains(event.target) && setAnchor(null);
    const dismiss = (event) => !(event.target instanceof Node && popoverRef.current?.contains(event.target)) && setAnchor(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [anchor]);
  if (!items.length) return <span className="name-stack-empty">{empty}</span>;
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  const chips = (
    <>
      {shown.map((item) => (
        <span key={item.key} className={`name-chip ${item.kind || ""} ${item.person ? "with-avatar" : ""}`}>
          {item.person &&
            (item.person.avatar_url ? (
              <img src={item.person.avatar_url} alt="" />
            ) : (
              <i style={{ background: chipTones[(item.person.id || 0) % chipTones.length] }}>{item.person.name?.split(" ").at(-1)?.charAt(0)}</i>
            ))}
          {item.label}
        </span>
      ))}
      {rest > 0 && <span className="name-chip more">+{rest}</span>}
    </>
  );
  if (!details) return <div className="name-stack">{chips}</div>;
  const open = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const top = rect.bottom + 6 + 320 > window.innerHeight ? Math.max(8, rect.top - 326) : rect.bottom + 6;
    setAnchor({ top, left: Math.min(rect.left, window.innerWidth - 300) });
  };
  return (
    <>
      <button type="button" className="name-stack clickable" onClick={(event) => (anchor ? setAnchor(null) : open(event))} aria-expanded={!!anchor} title="Xem đầy đủ">
        {chips}
      </button>
      {anchor && (
        <div className="name-popover" ref={popoverRef} style={{ top: anchor.top, left: anchor.left }} role="dialog" aria-label={title}>
          {title && <header>{title}</header>}
          {details.map((group) => (
            <section key={group.key}>
              <b>
                {group.title}
                <small>{group.names.length} người</small>
              </b>
              {group.names.length ? (
                <ul>
                  {group.names.map((name, index) => (
                    <li key={`${name}-${index}`}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p>Chưa có thành viên.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
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
