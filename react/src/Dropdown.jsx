import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import "./Dropdown.css";

const fold = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const SEARCH_FROM = 12;

export default function Dropdown({
  value,
  options,
  onChange,
  label,
  icon: Icon,
  align = "left",
  placement = "auto",
  className = "",
  disabled = false,
  field = false,
  searchable,
  placeholder,
  name,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState("");
  const [side, setSide] = useState("bottom");
  const ref = useRef(null);
  const listRef = useRef(null);
  const triggerRef = useRef(null);
  const typed = useRef({ text: "", at: 0 });
  const all = options.filter((option) => !option.divider);
  const canSearch = searchable ?? all.length > SEARCH_FROM;
  const needle = fold(query.trim());
  const visible = needle ? options.filter((option) => !option.divider && fold(`${option.label} ${option.hint ?? ""}`).includes(needle)) : options;
  const items = visible.filter((option) => !option.divider);
  const selected = all.find((option) => String(option.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => !ref.current?.contains(event.target) && setOpen(false);
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const show = () => {
    if (placement === "auto") {
      const rect = triggerRef.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      setSide(below < 280 && rect.top > below ? "top" : "bottom");
    } else {
      setSide(placement);
    }
    setQuery("");
    setActive(Math.max(0, all.indexOf(selected)));
    setOpen(true);
  };
  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const choose = (option) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  };
  const move = (step) => {
    if (!items.length) return;
    let next = active;
    for (let i = 0; i < items.length; i++) {
      next = (next + step + items.length) % items.length;
      if (!items[next].disabled) break;
    }
    setActive(next);
  };
  const onKeyDown = (event) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" || (event.key === " " && !canSearch)) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (!canSearch && event.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + fold(event.key), at: now };
      const hit = items.findIndex((option) => !option.disabled && fold(option.label).startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  let index = -1;
  return (
    <div className={`dd ${field ? "dd-field" : ""} ${className}`} ref={ref}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <button
        ref={triggerRef}
        type="button"
        className={`dd-trigger ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
      >
        {Icon && <Icon size={15} />}
        <span className={selected ? "" : "dd-placeholder"}>{selected?.label ?? placeholder ?? "—"}</span>
        <ChevronDown size={14} className="dd-chevron" />
      </button>
      {open && (
        <div className={`dd-list ${align} ${side}`} onClick={(event) => event.preventDefault()}>
          {canSearch && (
            <label className="dd-search">
              <Search size={14} />
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Tìm…"
                aria-label={`Tìm ${label ?? ""}`.trim()}
              />
            </label>
          )}
          <ul role="listbox" aria-label={label} ref={listRef}>
            {visible.map((option, position) => {
              if (option.divider) return <li key={`d${position}`} className="dd-divider" role="separator" />;
              index++;
              const current = index;
              const isSelected = String(option.value) === String(value);
              return (
                <li
                  key={option.value}
                  data-index={current}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  className={[isSelected && "selected", current === active && "active", option.disabled && "disabled"].filter(Boolean).join(" ")}
                  style={option.depth ? { paddingLeft: 10 + option.depth * 14 } : undefined}
                  onMouseEnter={() => setActive(current)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  <span>
                    {option.label}
                    {option.hint && <small>{option.hint}</small>}
                  </span>
                  {isSelected && <Check size={14} />}
                </li>
              );
            })}
            {!items.length && <li className="dd-empty">Không có kết quả phù hợp</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
