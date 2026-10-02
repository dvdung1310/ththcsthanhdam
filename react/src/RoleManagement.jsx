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
  const toggle = (id) =>
    setEditing((c) => ({
      ...c,
      role_ids: c.role_ids.includes(id)
        ? c.role_ids.filter((x) => x !== id)
        : [...c.role_ids, id],
    }));
  const save = async () => {
    try {
      const roles = editing.role_ids.map((role_id) => ({
          role_id,
          department_id: editing.department_id || null,
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
            <p>Gán vai trò và phạm vi tổ chuyên môn cho từng người dùng</p>
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
                <option value="">Tất cả bộ phận / tổ</option>
                {data.departments.map((department) => (
                  <option value={department.id} key={department.id}>
                    {department.name}
                  </option>
                ))}
                <option value="unassigned">Chưa phân bộ phận / tổ</option>
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
                        <span key={r.id}>{r.name}</span>
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
                          role_ids: u.roles.map((r) => r.id),
                          department_id:
                            u.roles.find((r) => r.department_id)
                              ?.department_id || "",
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
              <label className="scope-select">
                Phạm vi tổ chuyên môn
                <select
                  value={editing.department_id}
                  onChange={(e) =>
                    setEditing((c) => ({
                      ...c,
                      department_id: e.target.value ? +e.target.value : "",
                    }))
                  }
                >
                  <option value="">Toàn trường / Không giới hạn tổ</option>
                  {data.departments.map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="role-options">
                {data.roles.map((role) => (
                  <label
                    className={
                      editing.role_ids.includes(role.id) ? "selected" : ""
                    }
                    key={role.id}
                  >
                    <input
                      type="checkbox"
                      checked={editing.role_ids.includes(role.id)}
                      onChange={() => toggle(role.id)}
                    />
                    <span>
                      <b>{role.name}</b>
                      <small>
                        {role.description ||
                          role.permissions.map((p) => p.name).join(" · ")}
                      </small>
                      <em>{role.permissions.length} quyền</em>
                    </span>
                  </label>
                ))}
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
                  disabled={!editing.role_ids.length}
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
