import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import "./Dropdown.css";

const fold = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export default function Dropdown({ value, options, onChange, label, icon: Icon, align = "left", className = "", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef(null);
  const listRef = useRef(null);
  const typed = useRef({ text: "", at: 0 });
  const items = options.filter((option) => !option.divider);
  const selected = items.find((option) => String(option.value) === String(value));

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
    setActive(Math.max(0, items.indexOf(selected)));
    setOpen(true);
  };
  const choose = (option) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };
  const move = (step) => {
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
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + fold(event.key), at: now };
      const hit = items.findIndex((option) => !option.disabled && fold(option.label).startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  let index = -1;
  return (
    <div className={`dd ${className}`} ref={ref}>
      <button
        type="button"
        className={`dd-trigger ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        {Icon && <Icon size={15} />}
        <span>{selected?.label ?? "—"}</span>
        <ChevronDown size={14} className="dd-chevron" />
      </button>
      {open && (
        <ul className={`dd-list ${align}`} role="listbox" aria-label={label} ref={listRef}>
          {options.map((option, position) => {
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
                className={[isSelected && "selected", current === active && "active", option.disabled && "disabled", option.indent && "indent"].filter(Boolean).join(" ")}
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
        </ul>
      )}
    </div>
  );
}
