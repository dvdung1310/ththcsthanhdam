import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Pencil,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "./api";
import "./RoleManagement.css";
import "./RoleDepartmentFilter.css";
const scopeLabel = (role) =>
  ({
    system: "Toàn hệ thống",
    school: "Toàn trường",
    unit: role.unit_type === "nhom" ? "Theo nhóm" : "Theo tổ",
    self: "Cá nhân",
  })[role.scope] ?? "";

export default function RoleManagement() {
  const [data, setData] = useState({ users: [], roles: [], departments: [] }),
    [search, setSearch] = useState(""),
    [departmentFilter, setDepartmentFilter] = useState(""),
    [editing, setEditing] = useState(null),
    [success, setSuccess] = useState(""),
    [error, setError] = useState("");
  const load = async () => {
    try {
      const r = await apiFetch("/api/roles", {
          headers: { Accept: "application/json" },
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(t);
  }, [success]);
  const users = data.users.filter(
    (u) =>
      [u.name, u.email, u.teacher_code]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (departmentFilter === "" ||
        (departmentFilter === "unassigned"
          ? !u.department_ids?.length
          : u.department_ids?.includes(Number(departmentFilter)))),
  );
  const unitsFor = (role) =>
    data.departments.filter((d) => d.type === role.unit_type);
  const toggle = (role) =>
    setEditing((c) => ({
      ...c,
      assignments: c.assignments.some((a) => a.role_id === role.id)
        ? c.assignments.filter((a) => a.role_id !== role.id)
        : [...c.assignments, { role_id: role.id, department_id: "" }],
    }));
  const setUnit = (index, departmentId) =>
    setEditing((c) => ({
      ...c,
      assignments: c.assignments.map((a, i) =>
        i === index ? { ...a, department_id: departmentId } : a,
      ),
    }));
  const addUnit = (role) =>
    setEditing((c) => ({
      ...c,
      assignments: [...c.assignments, { role_id: role.id, department_id: "" }],
    }));
  const removeAssignment = (index) =>
    setEditing((c) => ({
      ...c,
      assignments: c.assignments.filter((_, i) => i !== index),
    }));
  const missingUnit = editing?.assignments.some(
    (a) =>
      data.roles.find((r) => r.id === a.role_id)?.scope === "unit" &&
      !a.department_id,
  );
  const save = async () => {
    try {
      const roles = editing.assignments.map((a) => ({
          role_id: a.role_id,
          department_id: a.department_id || null,
        })),
        r = await apiFetch(`/api/users/${editing.id}/roles`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ roles }),
        }),
        d = await r.json();
      if (!r.ok)
        throw new Error(Object.values(d.errors ?? {}).flat()[0] ?? d.message);
      setEditing(null);
      setSuccess(d.message);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="role-page">
      {success && (
        <div className="success-toast">
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
      <section className="role-stats">
        <article>
          <i>
            <Users />
          </i>
          <div>
            <b>{data.users.length}</b>
            <span>Tài khoản hệ thống</span>
          </div>
        </article>
        <article>
          <i>
            <ShieldCheck />
          </i>
          <div>
            <b>{data.roles.length}</b>
            <span>Vai trò sử dụng</span>
          </div>
        </article>
        <article>
          <i>
            <KeyRound />
          </i>
          <div>
            <b>{data.roles.reduce((n, r) => n + r.permissions.length, 0)}</b>
            <span>Lượt quyền đã cấu hình</span>
          </div>
        </article>
      </section>
      <section className="role-card">
        <div className="role-heading">
          <div>
            <h2>Phân quyền tài khoản</h2>
            <p>Gán vai trò và tổ/nhóm phụ trách cho từng người dùng</p>
          </div>
          <div className="role-filters">
            <label>
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tài khoản..."
              />
            </label>
            <label>
              <Building2 size={17} />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="">Tất cả tổ, nhóm</option>
                {data.departments.map((department) => (
                  <option value={department.id} key={department.id}>
                    {department.name}
                  </option>
                ))}
                <option value="unassigned">Chưa thuộc tổ, nhóm</option>
              </select>
            </label>
          </div>
        </div>
        {error && <div className="api-error">{error}</div>}
        <div className="role-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Tài khoản</th>
                <th>Vai trò hiện tại</th>
                <th>Số quyền</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {!users.length && (
                <tr>
                  <td className="role-empty" colSpan="6">
                    Không có tài khoản phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="role-user">
                      <span>{u.name.charAt(0)}</span>
                      <div>
                        <b>{u.name}</b>
                        <small>{u.teacher_code || "Tài khoản hệ thống"}</small>
                      </div>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <div className="role-chips">
                      {u.roles.map((r) => (
                        <span key={`${r.id}-${r.department_id}`}>{r.label}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <b>{u.permissions_count}</b> quyền
                  </td>
                  <td>
                    <span className={`account-status ${u.status}`}>
                      <i />
                      {u.status === "active" ? "Hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="edit-role"
                      onClick={() =>
                        setEditing({
                          ...u,
                          assignments: u.roles.map((r) => ({
                            role_id: r.id,
                            department_id: r.department_id ?? "",
                          })),
                        })
                      }
                    >
                      <Pencil size={15} /> Phân quyền
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <div className="modal-backdrop">
          <div className="role-modal">
            <div className="modal-head">
              <div>
                <h3>Phân quyền tài khoản</h3>
                <p>
                  {editing.name} · {editing.email}
                </p>
              </div>
              <button onClick={() => setEditing(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="role-modal-body">
              <div className="role-options">
                {data.roles.map((role) => {
                  const rows = editing.assignments
                    .map((a, index) => ({ ...a, index }))
                    .filter((a) => a.role_id === role.id);
                  const checked = rows.length > 0;
                  return (
                    <div
                      className={`role-option ${checked ? "selected" : ""}`}
                      key={role.id}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(role)}
                        />
                        <span>
                          <b>{role.name}</b>
                          <small>
                            {scopeLabel(role)} ·{" "}
                            {role.description ||
                              role.permissions.map((p) => p.name).join(" · ")}
                          </small>
                          <em>{role.permissions.length} quyền</em>
                        </span>
                      </label>
                      {checked && role.scope === "unit" && (
                        <div className="role-units">
                          {rows.map((row) => (
                            <div key={row.index}>
                              <select
                                value={row.department_id}
                                onChange={(e) =>
                                  setUnit(
                                    row.index,
                                    e.target.value ? +e.target.value : "",
                                  )
                                }
                              >
                                <option value="">
                                  {role.unit_type === "nhom"
                                    ? "Chọn nhóm..."
                                    : "Chọn tổ..."}
                                </option>
                                {unitsFor(role).map((d) => (
                                  <option value={d.id} key={d.id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                              {rows.length > 1 && (
                                <button
                                  type="button"
                                  title="Bỏ đơn vị này"
                                  onClick={() => removeAssignment(row.index)}
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            className="role-add-unit"
                            onClick={() => addUnit(role)}
                          >
                            + Thêm {role.unit_type === "nhom" ? "nhóm" : "tổ"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="modal-actions">
                <button
                  className="secondary-btn"
                  onClick={() => setEditing(null)}
                >
                  Hủy bỏ
                </button>
                <button
                  className="primary-btn"
                  disabled={missingUnit}
                  onClick={save}
                >
                  Lưu phân quyền
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
