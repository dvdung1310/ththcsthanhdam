import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Search, TriangleAlert, X } from "lucide-react";
import "./UnitMembershipEditor.css";

const POSITIONS = {
  to: [
    ["member", "Thành viên"],
    ["to_pho", "Tổ phó"],
    ["to_truong", "Tổ trưởng"],
  ],
  nhom: [
    ["member", "Thành viên"],
    ["nhom_truong", "Nhóm trưởng"],
  ],
};

export const SINGLE_HOLDER = ["to_truong", "nhom_truong"];

export function findHolderConflicts(roles, roleCatalog, people, personId) {
  const byId = Object.fromEntries(roleCatalog.map((role) => [role.id, role]));
  return roles
    .filter((row) => SINGLE_HOLDER.includes(byId[row.role_id]?.code) && row.department_id)
    .flatMap((row) =>
      people
        .filter((other) => other.id !== personId)
        .filter((other) => other.roles.some((role) => role.role_id === row.role_id && role.department_id === row.department_id))
        .map((other) => ({ department_id: row.department_id, role: byId[row.role_id].name, holder: other.name })),
    );
}

export default function UnitMembershipEditor({ units, unitIds, roles, roleCatalog, canAssignRoles, people, personId, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState([]);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const close = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", close, true);
    return () => document.removeEventListener("mousedown", close, true);
  }, [pickerOpen]);

  const unitById = useMemo(() => Object.fromEntries(units.map((unit) => [unit.id, unit])), [units]);
  const roleByCode = Object.fromEntries(roleCatalog.map((role) => [role.code, role]));
  const roleById = Object.fromEntries(roleCatalog.map((role) => [role.id, role]));
  const isUnitRole = (row) => roleById[row.role_id]?.scope === "unit";

  const roots = units.filter((unit) => !unit.parent_id || !unitById[unit.parent_id]);
  const childrenOf = (id) => units.filter((unit) => unit.parent_id === id);
  const selectedNhom = unitIds.filter((id) => unitById[id]?.parent_id && unitById[unitById[id].parent_id]);
  const impliedTo = [...new Set(selectedNhom.map((id) => unitById[id].parent_id))];
  const isSelected = (id) => unitIds.includes(id) || impliedTo.includes(id);

  const positionOf = (unitId) => {
    const row = roles.find((r) => isUnitRole(r) && r.department_id === unitId);
    return row ? roleById[row.role_id].code : "member";
  };
  const conflicts = findHolderConflicts(roles, roleCatalog, people, personId);

  const update = (nextUnits, nextRoles = roles) => onChange({ unit_ids: nextUnits, roles: nextRoles });

  const setPosition = (unitId, code) => {
    const kept = roles.filter((r) => !(isUnitRole(r) && r.department_id === unitId));
    update(unitIds, code === "member" ? kept : [...kept, { role_id: roleByCode[code].id, department_id: unitId }]);
  };

  const addUnit = (unit) => {
    if (isSelected(unit.id)) return;
    if (unit.parent_id && unitById[unit.parent_id]) {
      update([...unitIds.filter((id) => id !== unit.parent_id), unit.id]);
    } else {
      update([...unitIds, unit.id]);
    }
  };

  const removeUnit = (unit) => {
    const childIds = childrenOf(unit.id).map((child) => child.id);
    const removed = [unit.id, ...(unit.parent_id ? [] : childIds)];
    let nextUnits = unitIds.filter((id) => !removed.includes(id));
    const nextRoles = roles.filter((r) => !(isUnitRole(r) && removed.includes(r.department_id)));
    const parentId = unit.parent_id && unitById[unit.parent_id] ? unit.parent_id : null;
    if (parentId && !nextUnits.some((id) => unitById[id]?.parent_id === parentId) && nextRoles.some((r) => isUnitRole(r) && r.department_id === parentId)) {
      nextUnits = [...nextUnits, parentId];
    }
    update(nextUnits, nextRoles);
  };

  const toggleFromPicker = (unit) => (isSelected(unit.id) && unitIds.includes(unit.id) ? removeUnit(unit) : addUnit(unit));

  const q = query.trim().toLowerCase();
  const match = (unit) => unit.name.toLowerCase().includes(q);
  const pickerRoots = roots.filter((root) => !q || match(root) || childrenOf(root.id).some(match));

  const selectedRoots = roots.filter((root) => isSelected(root.id));

  const positionSelect = (unit) => (
    <select value={positionOf(unit.id)} disabled={!canAssignRoles} onChange={(e) => setPosition(unit.id, e.target.value)}>
      {POSITIONS[unit.parent_id && unitById[unit.parent_id] ? "nhom" : unit.type].map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );

  const conflictNote = (unitId) =>
    conflicts
      .filter((c) => c.department_id === unitId)
      .map((c) => (
        <p className="membership-conflict" key={c.holder}>
          <TriangleAlert size={13} /> Sẽ thay {c.role} hiện tại: <b>{c.holder}</b>
        </p>
      ));

  return (
    <div className="membership-editor">
      {selectedRoots.length === 0 && <p className="membership-empty">Chưa thuộc tổ, nhóm nào.</p>}
      {selectedRoots.map((root) => {
        const nhoms = childrenOf(root.id).filter((child) => unitIds.includes(child.id));
        const direct = unitIds.includes(root.id);
        return (
          <div className="membership-group" key={root.id}>
            <div className="membership-row">
              <span className="membership-name">
                <b>{root.parent_id ? root.label : root.name}</b>
                {!direct && <small>qua {nhoms.map((n) => n.name).join(", ")}</small>}
              </span>
              {positionSelect(root)}
              <button type="button" title={`Rời ${root.name}`} onClick={() => removeUnit(root)}>
                <X size={14} />
              </button>
            </div>
            {conflictNote(root.id)}
            {nhoms.map((nhom) => (
              <div key={nhom.id}>
                <div className="membership-row is-child">
                  <span className="membership-name">
                    <b>{nhom.name}</b>
                  </span>
                  {positionSelect(nhom)}
                  <button type="button" title={`Rời ${nhom.name}`} onClick={() => removeUnit(nhom)}>
                    <X size={14} />
                  </button>
                </div>
                {conflictNote(nhom.id)}
              </div>
            ))}
          </div>
        );
      })}

      <div className="membership-picker" ref={pickerRef}>
        <button type="button" className="link-btn" onClick={() => setPickerOpen((open) => !open)}>
          <Plus size={14} /> Thêm vào tổ / nhóm
        </button>
        {pickerOpen && (
          <div className="membership-popover">
            <label className="membership-search">
              <Search size={15} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tổ, nhóm..." />
            </label>
            <div className="membership-options">
              {pickerRoots.map((root) => {
                const kids = childrenOf(root.id).filter((child) => !q || match(root) || match(child));
                const open = q || expanded.includes(root.id);
                const viaNhom = impliedTo.includes(root.id) && !unitIds.includes(root.id);
                return (
                  <div key={root.id}>
                    <div className="membership-option">
                      {kids.length > 0 ? (
                        <button type="button" className="chevron" onClick={() => setExpanded((ids) => (ids.includes(root.id) ? ids.filter((id) => id !== root.id) : [...ids, root.id]))}>
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      ) : (
                        <span className="chevron" />
                      )}
                      <label>
                        <input type="checkbox" checked={isSelected(root.id)} disabled={viaNhom} onChange={() => toggleFromPicker(root)} />
                        <b>{root.parent_id ? root.label : root.name}</b>
                        {viaNhom && <small>đã thuộc qua nhóm</small>}
                        {kids.length > 0 && !viaNhom && <small>{childrenOf(root.id).length} nhóm</small>}
                      </label>
                    </div>
                    {open &&
                      kids.map((kid) => (
                        <div className="membership-option is-child" key={kid.id}>
                          <label>
                            <input type="checkbox" checked={unitIds.includes(kid.id)} onChange={() => toggleFromPicker(kid)} />
                            {kid.name}
                          </label>
                        </div>
                      ))}
                  </div>
                );
              })}
              {!pickerRoots.length && <p className="membership-empty">Không tìm thấy tổ, nhóm phù hợp.</p>}
            </div>
          </div>
        )}
      </div>
      {!canAssignRoles && <small className="membership-note">Chỉ người có quyền quản lý vai trò mới đổi được chức vụ.</small>}
    </div>
  );
}
