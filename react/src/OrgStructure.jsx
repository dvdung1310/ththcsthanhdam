import { useEffect, useState } from "react";
import { Building2, FolderTree, Pencil, Plus, Power, Trash2, Users } from "lucide-react";
import { apiJson } from "./api";
import { EMPLOYMENT_LABELS } from "./PersonnelDrawer";
import "./OrgStructure.css";

export default function OrgStructure({ onChanged, onError }) {
  const [units, setUnits] = useState([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);

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

  const refresh = async (message, nextId = selectedId) => {
    await loadUnits();
    setSelectedId(nextId);
    await loadDetail(nextId);
    onChanged(message);
  };

  const save = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      parent_id: form.get("parent_id") ? Number(form.get("parent_id")) : null,
    };
    try {
      if (editing.id) {
        const payload = await apiJson(`/api/units/${editing.id}`, {
          method: "PUT",
          body: { ...body, is_active: editing.is_active },
        });
        setEditing(null);
        await refresh(payload.message);
      } else {
        const payload = await apiJson("/api/units", { method: "POST", body });
        setEditing(null);
        await refresh(payload.message, payload.data.id);
      }
    } catch (e) {
      onError(e.message);
    }
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
    if (!window.confirm(`Xóa “${selected.label}”?`)) return;
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
            <p>{roots.length} tổ · {units.length - roots.length} nhóm</p>
          </div>
          {canConfigure && (
            <button className="primary-btn" onClick={() => setEditing({ parent_id: null })}>
              <Plus size={15} /> Thêm tổ
            </button>
          )}
        </div>
        <div className="org-tree">
          {units.map((unit) => (
            <button
              key={unit.id}
              className={`${unit.parent_id ? "is-child" : ""} ${unit.id === selectedId ? "active" : ""} ${unit.is_active ? "" : "is-inactive"}`}
              onClick={() => {
                setEditing(null);
                setSelectedId(unit.id);
              }}
            >
              {unit.parent_id ? <Users size={15} /> : <Building2 size={15} />}
              <span>{unit.name}</span>
              <em>{unit.members}</em>
            </button>
          ))}
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
        {editing ? (
          <form className="org-form" onSubmit={save} key={editing.id ?? `new-${editing.parent_id}`}>
            <h3>
              {editing.id
                ? `Sửa ${editing.parent_id ? "nhóm" : "tổ"}`
                : editing.parent_id
                  ? "Thêm nhóm"
                  : "Thêm tổ"}
            </h3>
            <label>
              Tên
              <input
                name="name"
                required
                autoFocus
                defaultValue={editing.name ?? ""}
                placeholder={editing.parent_id ? "VD: Nhóm toán" : "VD: Tổ tự nhiên"}
              />
            </label>
            {editing.parent_id != null && (
              <label>
                Thuộc tổ
                <select name="parent_id" defaultValue={editing.parent_id}>
                  {roots.map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="org-form-actions">
              <button type="button" className="secondary-btn" onClick={() => setEditing(null)}>
                Hủy
              </button>
              <button className="primary-btn">{editing.id ? "Lưu thay đổi" : "Thêm mới"}</button>
            </div>
          </form>
        ) : selected && detail?.unit?.id === selected.id ? (
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
                    <button onClick={() => setEditing({ parent_id: selected.id })}>
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
          </>
        ) : (
          <div className="org-empty">
            <FolderTree size={30} />
            <b>Chọn một tổ hoặc nhóm</b>
            <span>Xem người phụ trách và danh sách thành viên.</span>
          </div>
        )}
      </section>
    </div>
  );
}
