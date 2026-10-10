import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import UnitMembershipEditor, { findHolderConflicts } from "./UnitMembershipEditor";
import EvaluationTeacherHistory from "./EvaluationTeacherHistory";
import "./PersonnelDrawer.css";
import Dropdown from "./Dropdown";

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

const PROFILE_HINTS = {
  giao_vien: "Có hồ sơ giảng dạy, thuộc tổ/nhóm",
  nhan_vien: "Có hồ sơ nhân sự, thuộc tổ/nhóm (vd. Tổ Văn phòng)",
};

const needsProfile = (role) => role.scope === "unit" || role.code === "gvcn";

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
  canViewEvaluations,
  people,
  onClose,
  onSaved,
  onDeleted,
}) {
  const isNew = !person?.id;
  const confirm = useConfirm();
  const [form, setForm] = useState(() =>
    isNew
      ? {
          ...emptyPerson,
          roles: roles
            .filter((role) => role.code === "giao_vien")
            .map((role) => ({ role_id: role.id, department_id: "" })),
          homeroom: null,
        }
      : {
          ...emptyPerson,
          ...person,
          phone: person.phone ?? "",
          employee_code: person.employee_code ?? "",
          employment_status: person.employment_status ?? "working",
          unit_ids: [...person.unit_ids],
          roles: person.roles
            .filter((role) => role.code !== "gvcn")
            .map((role) => ({
              role_id: role.role_id,
              department_id: role.department_id ?? "",
            })),
          homeroom: person.roles.some((role) => role.code === "gvcn"),
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
      homeroom: value.homeroom,
    });
  const [initialSnapshot] = useState(() => snapshot(form));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const roleById = Object.fromEntries(roles.map((role) => [role.id, role]));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const schoolRoles = roles.filter((role) => role.scope !== "unit" && role.code !== "gvcn");
  const roleId = (code) => roles.find((role) => role.code === code)?.id;
  const giaoVienId = roleId("giao_vien");
  const profileIds = [giaoVienId, roleId("nhan_vien")];
  const gvcnId = roleId("gvcn");
  const lockedProfile = !isNew && person.is_employee;
  const has = (id) => form.roles.some((row) => row.role_id === id);
  const isTeacher = canAssignRoles ? has(giaoVienId) : isNew || person.kind === "teacher";
  const isEmployee = canAssignRoles ? profileIds.some(has) : isNew || person.is_employee;
  const toggleRole = (role) => {
    if (has(role.id)) {
      set("roles", form.roles.filter((row) => row.role_id !== role.id));
      return;
    }
    const others = profileIds.includes(role.id) ? profileIds.filter((id) => id !== role.id) : [];
    set("roles", [...form.roles.filter((row) => !others.includes(row.role_id)), { role_id: role.id, department_id: "" }]);
  };
  const dirty = password !== "" || snapshot(form) !== initialSnapshot;
  const missing = [
    !form.name.trim() && "Họ và tên",
    !form.email.trim() && "Email đăng nhập",
    canAssignRoles && isTeacher && form.homeroom === null && "Chủ nhiệm hay không chủ nhiệm",
    (isNew ? password.length < 8 : password && password.length < 8) && "Mật khẩu (tối thiểu 8 ký tự)",
  ].filter(Boolean);
  const blockedReason = missing.length ? `Còn thiếu: ${missing.join(", ")}` : !isNew && !dirty ? "Chưa có thay đổi" : "";
  const requestClose = async () => {
    if (
      dirty &&
      !(await confirm({
        tone: "warning",
        title: "Bỏ các thay đổi chưa lưu?",
        message: "Những gì bạn vừa nhập trong hồ sơ này sẽ không được lưu.",
        confirmText: "Bỏ thay đổi",
        cancelText: "Tiếp tục chỉnh sửa",
      }))
    )
      return;
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
      employee_code: isEmployee ? form.employee_code : null,
      employment_status: isEmployee ? form.employment_status : null,
      unit_ids: isEmployee ? unitIdsInScope : [],
      ...(password ? { password } : {}),
      ...(canAssignRoles
        ? {
            roles: [
              ...form.roles
                .filter((row) => isEmployee || !needsProfile(roleById[row.role_id]))
                .map((row) => ({
                  role_id: row.role_id,
                  department_id: row.department_id || null,
                })),
              ...(isTeacher && form.homeroom && gvcnId ? [{ role_id: gvcnId, department_id: null }] : []),
            ],
          }
        : {}),
    };
    const conflicts = canAssignRoles && isEmployee ? findHolderConflicts(form.roles, roles, people, person?.id) : [];
    if (conflicts.length) {
      const replace = await confirm({
        tone: "warning",
        title: "Thay người giữ chức vụ?",
        message: `${form.name || "Nhân sự này"} sẽ thay thế:`,
        details: conflicts.map((c) => `${units.find((u) => u.id === c.department_id)?.label}: ${c.role} ${c.holder}`),
        confirmText: "Thay thế và lưu",
        cancelText: "Xem lại",
      });
      if (!replace) {
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
    const ok = await confirm({
      tone: "danger",
      title: `Cho nghỉ và khóa ${person.name}?`,
      message: "Tài khoản sẽ bị khóa và hồ sơ chuyển sang trạng thái đã nghỉ việc. Lịch sử công việc và KPI vẫn được giữ lại.",
      confirmText: "Cho nghỉ & khóa",
      cancelText: "Hủy",
    });
    if (!ok) return;
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
                  <span>Họ và tên <span className="required-mark">*</span></span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </label>
                <label>
                  <span>Email đăng nhập <span className="required-mark">*</span></span>
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
                  <span>{isNew ? "Mật khẩu" : "Mật khẩu mới"}{isNew && <> <span className="required-mark">*</span></>}</span>
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
                    const checked = has(role.id);
                    const locked = checked && lockedProfile && profileIds.includes(role.id);
                    return (
                      <div key={role.id} className={`role-pick ${checked ? "selected" : ""}`} title={locked ? "Nhân sự đã có hồ sơ phải là Giáo viên hoặc Nhân viên. Chọn vai trò còn lại để chuyển, hoặc dùng “Cho nghỉ & khóa”." : undefined}>
                        <label>
                          <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleRole(role)} />
                          <b>{role.name}</b>
                          <small>{PROFILE_HINTS[role.code] ?? scopeLabel(role)}</small>
                        </label>
                        {role.id === giaoVienId && checked && (
                          <div className="homeroom-choice" role="radiogroup" aria-label="Chủ nhiệm">
                            {[[true, "Chủ nhiệm"], [false, "Không chủ nhiệm"]].map(([value, label]) => (
                              <label key={label} className={form.homeroom === value ? "active" : ""}>
                                <input type="radio" name="homeroom" checked={form.homeroom === value} onChange={() => set("homeroom", value)} />
                                {label}
                              </label>
                            ))}
                          </div>
                        )}
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

            {isEmployee && (
              <section>
                <h4>Hồ sơ nhân sự</h4>
                <div className="drawer-grid">
                  <label>
                    Mã nhân sự
                    <input
                      value={form.employee_code}
                      placeholder="Để trống để tự tạo"
                      onChange={(e) => set("employee_code", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Trạng thái công tác <span className="required-mark">*</span></span>
                    <Dropdown
                      field
                      label="Trạng thái công tác"
                      value={form.employment_status}
                      onChange={(value) => set("employment_status", value)}
                      options={["working", "on_leave", "suspended"].map((status) => ({ value: status, label: EMPLOYMENT_LABELS[status] }))}
                    />
                  </label>
                </div>
              </section>
            )}

            {isEmployee && (
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

            {canViewEvaluations && person?.employee_id && (
              <section>
                <h4>Thi đua</h4>
                <EvaluationTeacherHistory teacherId={person.employee_id} />
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
