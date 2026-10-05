import { useEffect, useState } from "react";
import { Building2, ChevronRight, FolderTree, Pencil, Plus, Power, Trash2, Users, X } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { EMPLOYMENT_LABELS } from "./PersonnelDrawer";
import "./OrgStructure.css";

const COLLAPSED_KEY = "org-collapsed";

export default function OrgStructure({ onChanged, onError }) {
  const [units, setUnits] = useState([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]")));
  const confirm = useConfirm();

  const loadUnits = async () => {
    try {
      const payload = await apiJson("/api/units");
      setUnits(payload.units);
      setCanConfigure(payload.can_configure);
      setSelectedId((current) => current ?? payload.units[0]?.id ?? null);
    } catch (e) {
      onError(e.message);
    }
  };

  const loadDetail = async (id) => {
    if (!id) return setDetail(null);
    try {
      setDetail(await apiJson(`/api/units/${id}`));
    } catch (e) {
      onError(e.message);
    }
  };

  useEffect(() => {
    loadUnits();
  }, []);
  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId]);

  const roots = units.filter((unit) => !unit.parent_id);
  const selected = units.find((unit) => unit.id === selectedId);
  const childrenOf = (id) => units.filter((unit) => unit.parent_id === id);

  const updateCollapsed = (next) => {
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
  };
  const toggle = (id) => {
    const next = new Set(collapsed);
    next.has(id) ? next.delete(id) : next.add(id);
    updateCollapsed(next);
  };
  const expand = (id) => {
    if (!collapsed.has(id)) return;
    const next = new Set(collapsed);
    next.delete(id);
    updateCollapsed(next);
  };
  const allCollapsed = roots.some((root) => childrenOf(root.id).length) && roots.every((root) => !childrenOf(root.id).length || collapsed.has(root.id));

  const refresh = async (message, nextId = selectedId) => {
    await loadUnits();
    setSelectedId(nextId);
    await loadDetail(nextId);
    onChanged(message);
  };

  const toggleActive = async () => {
    try {
      const payload = await apiJson(`/api/units/${selected.id}`, {
        method: "PUT",
        body: { name: selected.name, parent_id: selected.parent_id, is_active: !selected.is_active },
      });
      await refresh(payload.message);
    } catch (e) {
      onError(e.message);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      tone: "danger",
      title: `Xóa ${selected.parent_id ? "nhóm" : "tổ"} “${selected.name}”?`,
      message: "Chỉ xóa được đơn vị không còn nhóm con, thành viên, công việc hay chức vụ. Nếu đơn vị đã có dữ liệu, hãy dùng “Ngưng” thay vì xóa.",
      confirmText: "Xóa",
    });
    if (!ok) return;
    try {
      const payload = await apiJson(`/api/units/${selected.id}`, { method: "DELETE" });
      setSelectedId(null);
      await refresh(payload.message, null);
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <div className="org-layout">
      <section className="org-tree-card">
        <div className="org-tree-head">
          <div>
            <h3>Cơ cấu tổ chức</h3>
            <p>
              {roots.length} tổ · {units.length - roots.length} nhóm
              {units.length > roots.length && (
                <button type="button" className="org-link" onClick={() => updateCollapsed(allCollapsed ? new Set() : new Set(roots.map((root) => root.id)))}>
                  {allCollapsed ? "Mở rộng tất cả" : "Thu gọn tất cả"}
                </button>
              )}
            </p>
          </div>
          {canConfigure && (
            <button className="primary-btn" onClick={() => setEditing({ parent_id: null })}>
              <Plus size={15} /> Thêm tổ
            </button>
          )}
        </div>
        <div className="org-tree">
          {roots.map((root) => {
            const groups = childrenOf(root.id);
            const open = !collapsed.has(root.id);
            const hiddenSelected = !open && groups.some((group) => group.id === selectedId);
            return (
              <div key={root.id} className="org-branch" role="group">
                <div className={`org-row ${root.id === selectedId || hiddenSelected ? "active" : ""} ${root.is_active ? "" : "is-inactive"}`}>
                  {groups.length > 0 ? (
                    <button type="button" className={`org-toggle ${open ? "open" : ""}`} onClick={() => toggle(root.id)} aria-expanded={open} aria-label={open ? `Thu gọn ${root.name}` : `Mở rộng ${root.name}`}>
                      <ChevronRight size={15} />
                    </button>
                  ) : (
                    <span className="org-toggle-space" />
                  )}
                  <button type="button" className="org-select" onClick={() => setSelectedId(root.id)}>
                    <Building2 size={15} />
                    <span>{root.name}</span>
                    {groups.length > 0 && !open && <small>{groups.length} nhóm</small>}
                    <em>{root.members}</em>
                  </button>
                </div>
                {open &&
                  groups.map((group) => (
                    <div key={group.id} className={`org-row is-child ${group.id === selectedId ? "active" : ""} ${group.is_active ? "" : "is-inactive"}`}>
                      <button type="button" className="org-select" onClick={() => setSelectedId(group.id)}>
                        <Users size={15} />
                        <span>{group.name}</span>
                        <em>{group.members}</em>
                      </button>
                    </div>
                  ))}
              </div>
            );
          })}
          {!units.length && (
            <div className="org-empty">
              <FolderTree size={30} />
              <b>Chưa có tổ nào</b>
              <span>Thêm tổ đầu tiên để bắt đầu.</span>
            </div>
          )}
        </div>
      </section>

      <section className="org-detail-card">
        {selected && detail?.unit?.id === selected.id ? (
          <>
            <div className="org-detail-head">
              <div>
                <span className="org-type">{selected.parent_id ? "Nhóm" : "Tổ"}</span>
                <h3>{selected.label}</h3>
                <p>
                  {detail.members.length} giáo viên
                  {!selected.is_active && " · Ngưng hoạt động"}
                </p>
              </div>
              {canConfigure && (
                <div className="org-actions">
                  {!selected.parent_id && (
                    <button onClick={() => { expand(selected.id); setEditing({ parent_id: selected.id }); }}>
                      <Plus size={15} /> Thêm nhóm
                    </button>
                  )}
                  <button onClick={() => setEditing(selected)}>
                    <Pencil size={15} /> Sửa
                  </button>
                  <button onClick={toggleActive}>
                    <Power size={15} /> {selected.is_active ? "Ngưng" : "Kích hoạt"}
                  </button>
                  <button className="danger" onClick={remove}>
                    <Trash2 size={15} /> Xóa
                  </button>
                </div>
              )}
            </div>

            <div className="org-detail-body">
            <h4>Người phụ trách</h4>
            <div className="org-leaders">
              {detail.leaders.map((leader) => (
                <span key={`${leader.user_id}-${leader.role}`}>
                  <b>{leader.role}</b> {leader.name}
                </span>
              ))}
              {!detail.leaders.length && (
                <em>Chưa có. Gán tổ trưởng / nhóm trưởng trong hồ sơ nhân sự.</em>
              )}
            </div>

            <h4>Thành viên</h4>
            <div className="org-members">
              <table>
                <thead>
                  <tr>
                    <th>Giáo viên</th>
                    <th>Mã GV</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.members.map((member) => (
                    <tr key={member.user_id}>
                      <td>
                        <b>{member.name}</b>
                        {member.via && <small>qua {member.via}</small>}
                      </td>
                      <td>
                        <code>{member.employee_code}</code>
                      </td>
                      <td>
                        <div className="chip-list">
                          {member.roles.map((role) => (
                            <span key={role}>{role}</span>
                          ))}
                        </div>
                      </td>
                      <td>{EMPLOYMENT_LABELS[member.employment_status] ?? member.employment_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!detail.members.length && <p className="org-muted">Chưa có giáo viên trong đơn vị này.</p>}
            </div>
            </div>
          </>
        ) : (
          <div className="org-empty">
            <FolderTree size={30} />
            <b>Chọn một tổ hoặc nhóm</b>
            <span>Xem người phụ trách và danh sách thành viên.</span>
          </div>
        )}
      </section>

      {editing && (
        <UnitDialog
          unit={editing}
          roots={roots}
          onClose={() => setEditing(null)}
          onSaved={async (message, id) => {
            setEditing(null);
            await refresh(message, id ?? selectedId);
          }}
        />
      )}
    </div>
  );
}

function UnitDialog({ unit, roots, onClose, onSaved }) {
  const isGroup = unit.parent_id != null;
  const [name, setName] = useState(unit.name ?? "");
  const [parentId, setParentId] = useState(unit.parent_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const kind = isGroup ? "nhóm" : "tổ";
  const parent = roots.find((root) => root.id === Number(parentId));

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return setError(`Vui lòng nhập tên ${kind}.`);
    setSaving(true);
    setError("");
    const body = { name: name.trim(), parent_id: isGroup ? Number(parentId) : null };
    try {
      const payload = unit.id
        ? await apiJson(`/api/units/${unit.id}`, { method: "PUT", body: { ...body, is_active: unit.is_active } })
        : await apiJson("/api/units", { method: "POST", body });
      await onSaved(payload.message, unit.id ? null : payload.data?.id);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form className="org-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="org-dialog-title">
        <header>
          <span className="org-dialog-icon">{isGroup ? <Users size={18} /> : <Building2 size={18} />}</span>
          <div>
            <h3 id="org-dialog-title">{unit.id ? `Sửa ${kind}` : `Thêm ${kind}`}</h3>
            <p>
              {isGroup
                ? unit.id
                  ? "Đổi tên nhóm hoặc chuyển nhóm sang tổ khác."
                  : `Nhóm chuyên môn thuộc ${parent ? `“${parent.name}”` : "một tổ"}.`
                : "Tổ là đơn vị cấp trên, có thể chia thành nhiều nhóm."}
            </p>
          </div>
          <button type="button" className="org-dialog-close" onClick={onClose} disabled={saving} aria-label="Đóng"><X size={18} /></button>
        </header>
        <label>
          Tên {kind}
          <input value={name} autoFocus maxLength={150} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder={isGroup ? "VD: Nhóm toán" : "VD: Tổ tự nhiên"} />
        </label>
        {isGroup && (
          <label>
            Thuộc tổ
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              {roots.map((root) => <option key={root.id} value={root.id}>{root.name}</option>)}
            </select>
          </label>
        )}
        {error && <p className="org-dialog-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>Hủy</button>
          <button className="primary-btn" disabled={saving || !name.trim()}>
            {saving ? "Đang lưu..." : unit.id ? "Lưu thay đổi" : `Thêm ${kind}`}
          </button>
        </footer>
      </form>
    </div>
  );
}
