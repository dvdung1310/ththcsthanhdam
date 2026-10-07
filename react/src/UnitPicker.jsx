import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, Users } from "lucide-react";

const fold = (text) => (text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export default function UnitPicker({ teams, groups, team, group, onChange }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
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
  const query = fold(term.trim());
  const tree = teams
    .map((item) => {
      const children = groups.filter((child) => child.team_id === item.id);
      const selfHit = !query || fold(item.name).includes(query);
      const hits = selfHit ? children : children.filter((child) => fold(child.name).includes(query));
      return { ...item, children: hits, visible: selfHit || hits.length > 0 };
    })
    .filter((item) => item.visible);
  const label = group ? groups.find((item) => item.id === group)?.name : team ? teams.find((item) => item.id === team)?.name : "Mọi tổ / nhóm";
  const pick = (next) => {
    onChange(next);
    setOpen(false);
    setTerm("");
  };
  return (
    <div className="ev-unit-picker" ref={ref}>
      <button type="button" className={`ev-more-btn ${team ? "active" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Users size={15} /> <span>{label}</span> <ChevronDown size={14} />
      </button>
      {open && (
        <div className="ev-unit-panel" role="listbox" aria-label="Tổ / nhóm">
          <label className="ev-search">
            <Search size={15} />
            <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Tìm tổ hoặc nhóm..." />
          </label>
          <div className="ev-unit-list">
            {!query && (
              <button type="button" className={!team ? "selected" : ""} onClick={() => pick({ team: "", group: "" })}>
                <span>Mọi tổ / nhóm</span>
                {!team && <Check size={14} />}
              </button>
            )}
            {tree.map((item) => (
              <div key={item.id}>
                <button type="button" className={`unit ${team === item.id && !group ? "selected" : ""}`} onClick={() => pick({ team: String(item.id), group: "" })}>
                  <span>{item.name}</span>
                  {team === item.id && !group && <Check size={14} />}
                </button>
                {item.children.map((child) => (
                  <button key={child.id} type="button" className={`child ${group === child.id ? "selected" : ""}`} onClick={() => pick({ team: String(item.id), group: String(child.id) })}>
                    <span>{child.name}</span>
                    {group === child.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            ))}
            {!tree.length && <p className="ev-muted">Không tìm thấy tổ hoặc nhóm.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
