import { useEffect, useState } from "react";
import { CheckCircle2, Lock, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { apiJson } from "./api";
import "./RolePermissionMatrix.css";

const MODULE_LABELS = {
  dashboard: "Tổng quan",
  teachers: "Nhân sự",
  tasks: "Công việc",
  library: "Kho dữ liệu",
  evaluation: "Đánh giá thi đua",
  kpi: "KPI",
  reports: "Báo cáo",
  system: "Hệ thống",
};

const SCOPE_LABELS = { system: "Toàn hệ thống", school: "Toàn trường", self: "Cá nhân" };
const scopeLabel = (role) =>
  role.scope === "unit" ? (role.unit_type === "nhom" ? "Theo nhóm" : "Theo tổ") : SCOPE_LABELS[role.scope];

export default function RolePermissionMatrix() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    try {
      const payload = await apiJson("/api/roles");
      setRoles(payload.roles);
      setPermissions(payload.permissions);
      setDraft(Object.fromEntries(payload.roles.map((role) => [role.id, [...role.permission_ids]])));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!success) return undefined;
    const timeout = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(timeout);
  }, [success]);

  const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id));
  const dirtyRoles = roles.filter((role) => !role.locked && !sameSet(draft[role.id] ?? [], role.permission_ids));
  const modules = [...new Set(permissions.map((permission) => permission.module))];

  const toggle = (role, permissionId) => {
    if (role.locked) return;
    setDraft((current) => {
      const ids = current[role.id] ?? [];
      return { ...current, [role.id]: ids.includes(permissionId) ? ids.filter((id) => id !== permissionId) : [...ids, permissionId] };
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      for (const role of dirtyRoles) {
        await apiJson(`/api/roles/${role.id}/permissions`, { method: "PUT", body: { permission_ids: draft[role.id] } });
      }
      setSuccess(`Đã cập nhật quyền cho ${dirtyRoles.map((role) => role.name).join(", ")}.`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="matrix-page">
      {success && (
        <div className="success-toast" role="status">
          <span>
            <CheckCircle2 size={20} />
          </span>
          <div>
            <b>Thành công</b>
            <small>{success}</small>
          </div>
          <button onClick={() => setSuccess("")}>
            <X size={17} />
          </button>
        </div>
      )}

      <section className="matrix-card">
        <div className="matrix-head">
          <div>
            <h2>
              <ShieldCheck size={20} /> Vai trò & quyền
            </h2>
            <p>Tick để cấp quyền cho từng vai trò. Thay đổi có hiệu lực ngay ở lần thao tác tiếp theo của người dùng.</p>
          </div>
          {dirtyRoles.length > 0 && (
            <div className="matrix-savebar">
              <span>Thay đổi chưa lưu: {dirtyRoles.map((role) => role.name).join(", ")}</span>
              <button className="secondary-btn" disabled={saving} onClick={() => setDraft(Object.fromEntries(roles.map((role) => [role.id, [...role.permission_ids]])))}>
                Hoàn tác
              </button>
              <button className="primary-btn" disabled={saving} onClick={save}>
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          )}
        </div>
        {error && (
          <div className="matrix-error">
            <TriangleAlert size={16} /> {error}
          </div>
        )}

        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th className="perm-col">Quyền</th>
                {roles.map((role) => (
                  <th key={role.id} className={dirtyRoles.includes(role) ? "dirty" : ""}>
                    <b>
                      {role.locked && <Lock size={12} />} {role.name}
                    </b>
                    <small>{scopeLabel(role)}</small>
                    <em>{role.users_count} người</em>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => (
                <ModuleRows
                  key={module}
                  label={MODULE_LABELS[module] ?? module}
                  permissions={permissions.filter((permission) => permission.module === module)}
                  roles={roles}
                  draft={draft}
                  onToggle={toggle}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="matrix-note">
          <Lock size={13} /> Quản trị viên luôn có toàn bộ quyền và không thể chỉnh sửa. Quyền gắn nhãn “Chưa áp dụng” đã có trong danh mục nhưng hệ thống chưa kiểm tra.
        </p>
      </section>
    </div>
  );
}

function ModuleRows({ label, permissions, roles, draft, onToggle }) {
  return (
    <>
      <tr className="module-row">
        <td colSpan={roles.length + 1}>{label}</td>
      </tr>
      {permissions.map((permission) => (
        <tr key={permission.id}>
          <td className="perm-col">
            <b>{permission.name}</b>
            <small>
              <code>{permission.code}</code>
              {!permission.enforced && <span className="not-enforced">Chưa áp dụng</span>}
            </small>
          </td>
          {roles.map((role) => {
            const checked = (draft[role.id] ?? []).includes(permission.id);
            const changed = checked !== role.permission_ids.includes(permission.id);
            return (
              <td key={role.id} className={`cell ${changed ? "changed" : ""}`}>
                <input
                  type="checkbox"
                  aria-label={`${permission.name} — ${role.name}`}
                  checked={checked}
                  disabled={role.locked}
                  onChange={() => onToggle(role, permission.id)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
