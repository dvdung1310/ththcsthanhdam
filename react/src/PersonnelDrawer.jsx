import { useState } from "react";
import { Info, Plus, Trash2, X } from "lucide-react";
import { apiJson } from "./api";
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
  is_teacher: true,
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
  scope,
  onClose,
  onSaved,
  onDeleted,
}) {
  const isNew = !person?.id;
  const [form, setForm] = useState(() =>
    isNew
      ? {
          ...emptyPerson,
          is_teacher: true,
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const roleById = Object.fromEntries(roles.map((role) => [role.id, role]));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleUnit = (id) =>
    set(
      "unit_ids",
      form.unit_ids.includes(id)
        ? form.unit_ids.filter((unitId) => unitId !== id)
        : [...form.unit_ids, id],
    );
  const toggleRole = (role) =>
    set(
      "roles",
      form.roles.some((row) => row.role_id === role.id)
        ? form.roles.filter((row) => row.role_id !== role.id)
        : [...form.roles, { role_id: role.id, department_id: "" }],
    );
  const setRoleUnit = (index, departmentId) =>
    set(
      "roles",
      form.roles.map((row, i) =>
        i === index ? { ...row, department_id: departmentId } : row,
      ),
    );
  const addRoleUnit = (role) =>
    set("roles", [...form.roles, { role_id: role.id, department_id: "" }]);
  const removeRoleRow = (index) =>
    set(
      "roles",
      form.roles.filter((_, i) => i !== index),
    );

  const missingUnit = form.roles.some(
    (row) => roleById[row.role_id]?.scope === "unit" && !row.department_id,
  );
  const autoAdded = form.is_teacher
    ? [
        ...new Set(
          form.roles
            .filter(
              (row) =>
                roleById[row.role_id]?.scope === "unit" &&
                row.department_id &&
                !form.unit_ids.some(
                  (id) =>
                    id === row.department_id ||
                    units.find((unit) => unit.id === id)?.parent_id === row.department_id,
                ),
            )
            .map((row) => row.department_id),
        ),
      ]
    : [];
  const unitLabel = (id) => units.find((unit) => unit.id === id)?.label ?? "";

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const body = {
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      is_active: form.is_active,
      is_teacher: form.is_teacher,
      employee_code: form.is_teacher ? form.employee_code : null,
      employment_status: form.is_teacher ? form.employment_status : null,
      unit_ids: form.is_teacher ? form.unit_ids : [],
      ...(password ? { password } : {}),
      ...(canAssignRoles
        ? {
            roles: form.roles
              .filter((row) => form.is_teacher || !teacherOnly(roleById[row.role_id]))
              .map((row) => ({
                role_id: row.role_id,
                department_id: row.department_id || null,
              })),
          }
        : {}),
    };
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
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="personnel-drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h3>{isNew ? "Thêm nhân sự" : form.name}</h3>
            <p>{isNew ? "Tạo tài khoản và hồ sơ công tác" : form.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">
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
                <label className={`switch ${!isNew && person.is_teacher ? "disabled" : ""}`}>
                  <input
                    type="checkbox"
                    checked={form.is_teacher}
                    disabled={(!isNew && person.is_teacher) || scope !== "school"}
                    onChange={(e) => set("is_teacher", e.target.checked)}
                  />
                  <span />
                  Là giáo viên
                </label>
              </div>
              {form.is_teacher && (
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
              )}
            </section>

            {form.is_teacher && (
              <section>
                <h4>Thuộc tổ / nhóm</h4>
                <div className="unit-checklist">
                  {units.map((unit) => (
                    <label key={unit.id} className={unit.parent_id ? "is-child" : ""}>
                      <input
                        type="checkbox"
                        checked={form.unit_ids.includes(unit.id)}
                        onChange={() => toggleUnit(unit.id)}
                      />
                      {unit.name}
                    </label>
                  ))}
                  {!units.length && <p>Chưa có tổ, nhóm nào.</p>}
                </div>
              </section>
            )}

            <section>
              <h4>Vai trò</h4>
              {canAssignRoles ? (
                <>
                  <div className="role-picker">
                    {roles.map((role) => {
                      const rows = form.roles
                        .map((row, index) => ({ ...row, index }))
                        .filter((row) => row.role_id === role.id);
                      const checked = rows.length > 0;
                      const unavailable = !form.is_teacher && teacherOnly(role);
                      return (
                        <div
                          key={role.id}
                          className={`role-pick ${checked && !unavailable ? "selected" : ""} ${unavailable ? "unavailable" : ""}`}
                        >
                          <label>
                            <input
                              type="checkbox"
                              checked={checked && !unavailable}
                              disabled={unavailable}
                              onChange={() => toggleRole(role)}
                            />
                            <b>{role.name}</b>
                            <small>{scopeLabel(role)}</small>
                          </label>
                          {checked && !unavailable && role.scope === "unit" && (
                            <div className="role-pick-units">
                              {rows.map((row) => (
                                <div key={row.index}>
                                  <select
                                    value={row.department_id}
                                    onChange={(e) =>
                                      setRoleUnit(
                                        row.index,
                                        e.target.value ? Number(e.target.value) : "",
                                      )
                                    }
                                  >
                                    <option value="">
                                      {role.unit_type === "nhom" ? "Chọn nhóm..." : "Chọn tổ..."}
                                    </option>
                                    {units
                                      .filter((unit) => unit.type === role.unit_type)
                                      .map((unit) => (
                                        <option key={unit.id} value={unit.id}>
                                          {unit.label}
                                        </option>
                                      ))}
                                  </select>
                                  {rows.length > 1 && (
                                    <button
                                      type="button"
                                      title="Bỏ đơn vị này"
                                      onClick={() => removeRoleRow(row.index)}
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => addRoleUnit(role)}
                              >
                                <Plus size={13} /> Thêm {role.unit_type === "nhom" ? "nhóm" : "tổ"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {autoAdded.length > 0 && (
                    <p className="drawer-hint">
                      <Info size={15} /> Sẽ tự thêm vào: {autoAdded.map(unitLabel).join(", ")}
                    </p>
                  )}
                </>
              ) : (
                <div className="role-readonly">
                  {person?.roles?.length ? (
                    person.roles.map((role) => (
                      <span key={`${role.role_id}-${role.department_id}`}>{role.label}</span>
                    ))
                  ) : (
                    <em>Giáo viên</em>
                  )}
                  <small>Chỉ người có quyền quản lý vai trò mới thay đổi được mục này.</small>
                </div>
              )}
            </section>
          </div>
          <footer>
            {!isNew && (
              <button type="button" className="danger-link" onClick={remove}>
                <Trash2 size={15} /> Cho nghỉ & khóa
              </button>
            )}
            <span />
            <button type="button" className="secondary-btn" onClick={onClose}>
              Hủy
            </button>
            <button className="primary-btn" disabled={saving || missingUnit}>
              {saving ? "Đang lưu..." : isNew ? "Thêm nhân sự" : "Lưu thay đổi"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
