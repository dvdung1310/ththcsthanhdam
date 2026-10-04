import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { apiJson } from "./api";
import UnitMembershipEditor, { findHolderConflicts } from "./UnitMembershipEditor";
import "./PersonnelDrawer.css";

export const EMPLOYMENT_LABELS = {
  working: "Đang làm việc",
  on_leave: "Nghỉ phép",
  suspended: "Tạm nghỉ",
  terminated: "Đã nghỉ việc",
};

const SCOPE_LABELS = {
  system: "Toàn hệ thống",
  school: "Toàn trường",
  self: "Cá nhân",
};

const scopeLabel = (role) =>
  role.scope === "unit"
    ? role.unit_type === "nhom"
      ? "Theo nhóm"
      : "Theo tổ"
    : SCOPE_LABELS[role.scope];

const teacherOnly = (role) => role.scope === "unit" || role.code === "giao_vien";

const emptyPerson = {
  name: "",
  email: "",
  phone: "",
  is_active: true,
  employee_code: "",
  employment_status: "working",
  unit_ids: [],
  roles: [],
};

export default function PersonnelDrawer({
  person,
  roles,
  units,
  canAssignRoles,
  people,
  onClose,
  onSaved,
  onDeleted,
}) {
  const isNew = !person?.id;
  const [form, setForm] = useState(() =>
    isNew
      ? {
          ...emptyPerson,
          roles: roles
            .filter((role) => role.code === "giao_vien")
            .map((role) => ({ role_id: role.id, department_id: "" })),
        }
      : {
          ...emptyPerson,
          ...person,
          phone: person.phone ?? "",
          employee_code: person.employee_code ?? "",
          employment_status: person.employment_status ?? "working",
          unit_ids: [...person.unit_ids],
          roles: person.roles.map((role) => ({
            role_id: role.role_id,
            department_id: role.department_id ?? "",
          })),
        },
  );
  const [password, setPassword] = useState("");
  const snapshot = (value) =>
    JSON.stringify({
      name: value.name.trim(),
      email: value.email.trim(),
      phone: (value.phone ?? "").trim(),
      is_active: value.is_active,
      employee_code: (value.employee_code ?? "").trim(),
      employment_status: value.employment_status,
      unit_ids: [...value.unit_ids].sort(),
      roles: value.roles.map((row) => `${row.role_id}-${row.department_id || ""}`).sort(),
    });
  const [initialSnapshot] = useState(() => snapshot(form));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const roleById = Object.fromEntries(roles.map((role) => [role.id, role]));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const schoolRoles = roles.filter((role) => role.scope !== "unit");
  const giaoVienId = roles.find((role) => role.code === "giao_vien")?.id;
  const lockedTeacher = !isNew && person.is_teacher;
  const isTeacher = canAssignRoles ? form.roles.some((row) => row.role_id === giaoVienId) : isNew || person.is_teacher;
  const toggleRole = (role) =>
    set(
      "roles",
      form.roles.some((row) => row.role_id === role.id)
        ? form.roles.filter((row) => row.role_id !== role.id)
        : [...form.roles, { role_id: role.id, department_id: "" }],
    );
  const dirty = password !== "" || snapshot(form) !== initialSnapshot;
  const missing = [
    !form.name.trim() && "Họ và tên",
    !form.email.trim() && "Email đăng nhập",
    (isNew ? password.length < 8 : password && password.length < 8) && "Mật khẩu (tối thiểu 8 ký tự)",
    isTeacher && !(form.employee_code ?? "").trim() && "Mã giáo viên",
  ].filter(Boolean);
  const blockedReason = missing.length ? `Còn thiếu: ${missing.join(", ")}` : !isNew && !dirty ? "Chưa có thay đổi" : "";
  const requestClose = () => {
    if (dirty && !window.confirm("Bỏ các thay đổi chưa lưu?")) return;
    onClose();
  };
  const unitIdsInScope = form.unit_ids.filter((id) => units.some((unit) => unit.id === id));

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const body = {
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      is_active: form.is_active,
      employee_code: isTeacher ? form.employee_code : null,
      employment_status: isTeacher ? form.employment_status : null,
      unit_ids: isTeacher ? unitIdsInScope : [],
      ...(password ? { password } : {}),
      ...(canAssignRoles
        ? {
            roles: form.roles
              .filter((row) => isTeacher || !teacherOnly(roleById[row.role_id]))
              .map((row) => ({
                role_id: row.role_id,
                department_id: row.department_id || null,
              })),
          }
        : {}),
    };
    const conflicts = canAssignRoles && isTeacher ? findHolderConflicts(form.roles, roles, people, person?.id) : [];
    if (conflicts.length) {
      const lines = conflicts.map((c) => `• ${units.find((u) => u.id === c.department_id)?.label}: thay ${c.role} ${c.holder}`).join("\n");
      if (!window.confirm(`Các đơn vị sau đã có người giữ chức vụ:\n${lines}\n\nThay thế bằng ${form.name}?`)) {
        setSaving(false);
        return;
      }
      body.replace_holders = true;
    }
    try {
      const payload = await apiJson(
        isNew ? "/api/personnel" : `/api/personnel/${person.id}`,
        { method: isNew ? "POST" : "PUT", body },
      );
      onSaved(payload.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        `Cho nghỉ và khóa tài khoản “${person.name}”? Lịch sử công việc vẫn được giữ lại.`,
      )
    )
      return;
    try {
      const payload = await apiJson(`/api/personnel/${person.id}`, {
        method: "DELETE",
      });
      onDeleted(payload.message);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="drawer-backdrop" onMouseDown={requestClose}>
      <aside
        className="personnel-drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h3>{isNew ? "Thêm nhân sự" : form.name}</h3>
            <p>{isNew ? "Tạo tài khoản và hồ sơ công tác" : form.email}</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </header>
        <form onSubmit={save}>
          <div className="drawer-body">
            {error && <div className="drawer-error">{error}</div>}

            <section>
              <h4>Hồ sơ</h4>
              <div className="drawer-grid">
                <label>
                  Họ và tên
                  <input
                    required
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </label>
                <label>
                  Email đăng nhập
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                  />
                </label>
                <label>
                  Số điện thoại
                  <input
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </label>
                <label>
                  {isNew ? "Mật khẩu" : "Mật khẩu mới"}
                  <input
                    type="password"
                    minLength={8}
                    required={isNew}
                    value={password}
                    placeholder={isNew ? "Tối thiểu 8 ký tự" : "Để trống nếu không đổi"}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </div>
              <div className="drawer-switches">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => set("is_active", e.target.checked)}
                  />
                  <span />
                  Tài khoản đang hoạt động
                </label>
              </div>
            </section>

            <section>
              <h4>Vai trò</h4>
              {canAssignRoles ? (
                <div className="role-picker">
                  {schoolRoles.map((role) => {
                    const checked = form.roles.some((row) => row.role_id === role.id);
                    const locked = role.id === giaoVienId && lockedTeacher;
                    return (
                      <div key={role.id} className={`role-pick ${checked ? "selected" : ""}`} title={locked ? "Nhân sự đã có dữ liệu công việc. Dùng “Cho nghỉ & khóa” nếu không còn là giáo viên." : undefined}>
                        <label>
                          <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleRole(role)} />
                          <b>{role.name}</b>
                          <small>{role.id === giaoVienId ? "Có hồ sơ giảng dạy, thuộc tổ/nhóm" : scopeLabel(role)}</small>
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="role-readonly">
                  {person?.roles?.filter((role) => !role.department_id).length ? (
                    person.roles
                      .filter((role) => !role.department_id)
                      .map((role) => <span key={role.role_id}>{role.label}</span>)
                  ) : (
                    <em>Giáo viên</em>
                  )}
                  <small>Chỉ người có quyền quản lý vai trò mới thay đổi được mục này.</small>
                </div>
              )}
            </section>

            {isTeacher && (
              <section>
                <h4>Thông tin giáo viên</h4>
                <div className="drawer-grid">
                  <label>
                    Mã giáo viên
                    <input
                      required
                      value={form.employee_code}
                      onChange={(e) => set("employee_code", e.target.value)}
                    />
                  </label>
                  <label>
                    Trạng thái công tác
                    <select
                      value={form.employment_status}
                      onChange={(e) => set("employment_status", e.target.value)}
                    >
                      {["working", "on_leave", "suspended"].map((status) => (
                        <option key={status} value={status}>
                          {EMPLOYMENT_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
            )}

            {isTeacher && (
              <section>
                <h4>Tổ / nhóm & chức vụ</h4>
                <UnitMembershipEditor
                  units={units}
                  unitIds={form.unit_ids}
                  roles={form.roles}
                  roleCatalog={roles}
                  canAssignRoles={canAssignRoles}
                  people={people}
                  personId={person?.id}
                  onChange={({ unit_ids, roles: nextRoles }) => setForm((current) => ({ ...current, unit_ids, roles: nextRoles }))}
                />
              </section>
            )}

          </div>
          <div className="drawer-footer">
            {!isNew && (
              <button type="button" className="danger-link" onClick={remove}>
                <Trash2 size={15} /> <span>Cho nghỉ & khóa</span>
              </button>
            )}
            <span className="drawer-status">{missing.length ? blockedReason : ""}</span>
            <button type="button" className="secondary-btn" onClick={requestClose}>
              Hủy
            </button>
            <button className="primary-btn" disabled={saving || Boolean(blockedReason)} title={blockedReason || undefined}>
              {saving ? "Đang lưu..." : isNew ? "Thêm nhân sự" : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
