import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Search, Users } from "lucide-react";
import "./PeoplePicker.css";

const SCHOOL_ROLES = ["admin", "hieu_truong", "thu_ky"];
const RANK = { admin: 0, hieu_truong: 1, thu_ky: 2, to_truong: 3, to_pho: 4, nhom_truong: 5 };

const rankOf = (person) =>
  Math.min(9, ...(person.roles || []).map((role) => RANK[role.code] ?? 9));

export function roleChips(person, unitId, units) {
  const roles = person.roles || [];
  const unitName = (id) => units.find((u) => u.id === id)?.short_name || "";
  const inScope = (id) =>
    !unitId || id === unitId || units.find((u) => u.id === id)?.parent_id === unitId;
  const chips = [
    ...roles.filter((r) => SCHOOL_ROLES.includes(r.code)).map((r) => ({ label: r.name, tone: "school" })),
    ...roles
      .filter((r) => r.department_id && inScope(r.department_id))
      .map((r) => ({
        label: r.department_id === unitId ? r.name : `${r.name} · ${unitName(r.department_id)}`,
        tone: "unit",
      })),
  ];
  if (!chips.length && roles.some((r) => r.code === "giao_vien")) chips.push({ label: "Giáo viên", tone: "plain" });
  return chips;
}

export function useOutsideClose(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => !ref.current?.contains(event.target) && onClose();
    const escape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onClose]);
  return ref;
}

export default function PeoplePicker({
  people,
  units,
  selectedPeople = [],
  selectedUnits = [],
  onTogglePerson,
  onToggleUnit,
  title,
}) {
  const [focus, setFocus] = useState(null);
  const [search, setSearch] = useState("");
  const roots = units.filter((u) => !u.parent_id || !units.some((p) => p.id === u.parent_id));
  const countIn = (id) => people.filter((p) => p.department_ids?.includes(id)).length;
  const focusedUnit = units.find((u) => u.id === focus);
  const keyword = search.trim().toLowerCase();
  const list = useMemo(
    () =>
      people
        .filter((p) => keyword || !focus || p.department_ids?.includes(focus))
        .filter((p) => !keyword || `${p.name} ${p.code || ""}`.toLowerCase().includes(keyword))
        .sort((a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name, "vi")),
    [people, focus, keyword],
  );
  const unitRow = (unit, child) => {
    const checked = selectedUnits.includes(unit.id);
    return (
      <div key={unit.id} className={`pp-unit ${child ? "child" : ""} ${focus === unit.id ? "focused" : ""}`}>
        {onToggleUnit && (
          <button
            type="button"
            className={`pp-check ${checked ? "checked" : ""}`}
            title={checked ? "Bỏ giao cho cả đơn vị" : "Giao cho cả đơn vị"}
            aria-pressed={checked}
            onClick={() => onToggleUnit(unit.id)}
          >
            {checked && <Check size={12} />}
          </button>
        )}
        <button type="button" className="pp-unit-name" onClick={() => setFocus(unit.id)}>
          <span title={unit.name}>{unit.short_name || unit.name}</span>
          <small>{countIn(unit.id)}</small>
        </button>
      </div>
    );
  };
  return (
    <div className="people-picker" role="dialog" aria-label={title}>
      <label className="pp-search">
        <Search size={15} />
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc mã giáo viên..." />
      </label>
      <div className="pp-body">
        <nav className="pp-tree">
          <div className={`pp-unit ${!focus ? "focused" : ""}`}>
            <button type="button" className="pp-unit-name" onClick={() => setFocus(null)}>
              <span>Tất cả</span>
              <small>{people.length}</small>
            </button>
          </div>
          {roots.map((root) => [unitRow(root, false), ...units.filter((u) => u.parent_id === root.id).map((u) => unitRow(u, true))])}
          {!units.length && <p className="pp-empty">Chưa có tổ / nhóm.</p>}
        </nav>
        <div className="pp-people">
          <header>
            <b>{keyword ? "Kết quả tìm kiếm" : focusedUnit ? focusedUnit.name : "Tất cả nhân sự"}</b>
            <small>{list.length} người</small>
          </header>
          {focusedUnit && onToggleUnit && !keyword && (
            <button
              type="button"
              className={`pp-whole-unit ${selectedUnits.includes(focusedUnit.id) ? "checked" : ""}`}
              onClick={() => onToggleUnit(focusedUnit.id)}
            >
              <Users size={15} />
              <span>
                {selectedUnits.includes(focusedUnit.id) ? "Đã giao cho cả " : "Giao cho cả "}
                {focusedUnit.short_name || focusedUnit.name}
              </span>
              {selectedUnits.includes(focusedUnit.id) && <CheckCircle2 size={16} />}
            </button>
          )}
          <div className="pp-list">
            {list.map((person) => {
              const selected = selectedPeople.includes(person.id);
              return (
                <button type="button" key={person.id} className={`pp-person ${selected ? "selected" : ""}`} onClick={() => onTogglePerson(person.id)}>
                  {person.avatar_url ? <img src={person.avatar_url} alt="" /> : <i>{person.name.charAt(0)}</i>}
                  <span className="pp-person-main">
                    <b>{person.name}</b>
                    <span className="pp-roles">
                      {person.code && <small>{person.code}</small>}
                      {roleChips(person, focus, units).map((chip) => (
                        <em key={chip.label} className={chip.tone}>
                          {chip.label}
                        </em>
                      ))}
                    </span>
                  </span>
                  {selected && <CheckCircle2 size={16} />}
                </button>
              );
            })}
            {!list.length && <p className="pp-empty">Không có nhân sự phù hợp.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
