import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

export default function InfoPopover({ label, text, up = false, children }) {
  const [open, setOpen] = useState(false);
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
  return (
    <span className="ev-info-pop" ref={ref}>
      <button type="button" className={`ev-info-btn ${open ? "active" : ""}`} aria-label={label} aria-expanded={open} title={label} onClick={() => setOpen(!open)}>
        <Info size={15} />
        {text && <span>{text}</span>}
      </button>
      {open && <div className={`ev-info-panel ${up ? "up" : ""}`} role="dialog" aria-label={label}>{children}</div>}
    </span>
  );
}
