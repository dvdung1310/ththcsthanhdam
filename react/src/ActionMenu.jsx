import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import "./ActionMenu.css";

export function MenuList({ items, position, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const outside = (event) => !ref.current?.contains(event.target) && onClose();
    const escape = (event) => event.key === "Escape" && onClose();
    const scroll = (event) => !ref.current?.contains(event.target) && onClose();
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  const visible = items
    .filter(Boolean)
    .filter((item) => !item.hidden)
    .filter((item, index, list) => !item.divider || (index > 0 && index < list.length - 1 && !list[index + 1].divider));
  return createPortal(
    <div className="action-menu" ref={ref} role="menu" style={position} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
      {visible.map((item, index) =>
        item.divider ? (
          index > 0 && index < visible.length - 1 ? <hr key={`d${index}`} /> : null
        ) : (
          <button
            type="button"
            role="menuitem"
            key={item.key}
            className={item.danger ? "danger" : ""}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick?.();
            }}
          >
            {item.icon && <item.icon size={16} />}
            <span>{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

export function menuPosition(x, y, width = 220, height = 320) {
  return { left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - height - 8)) };
}

export default function ActionMenu({ items, label = "Thao tác khác", size = 16, className = "" }) {
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const open = (event) => {
    event.stopPropagation();
    if (position) return setPosition(null);
    const rect = buttonRef.current.getBoundingClientRect();
    const count = items.filter(Boolean).filter((item) => !item.hidden).length;
    setPosition(menuPosition(rect.right - 220, rect.bottom + 4, 220, count * 36 + 16));
  };
  return (
    <>
      <button type="button" ref={buttonRef} className={`action-menu-trigger ${position ? "open" : ""} ${className}`} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={!!position} onClick={open} onDoubleClick={(event) => event.stopPropagation()}>
        <MoreHorizontal size={size} />
      </button>
      {position && <MenuList items={items} position={position} onClose={() => setPosition(null)} />}
    </>
  );
}
