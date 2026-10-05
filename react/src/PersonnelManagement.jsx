import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  UserRoundCog,
  Users,
  UserX,
  X,
} from "lucide-react";
import { apiJson } from "./api";
import PersonnelDrawer, { EMPLOYMENT_LABELS } from "./PersonnelDrawer";
import OrgStructure from "./OrgStructure";
import "./PersonnelManagement.css";

const LEADER_ROLES = ["hieu_truong", "thu_ky", "to_truong", "to_pho", "nhom_truong"];

const statusOf = (person) => {
  if (!person.is_active) return person.employment_status === "terminated" ? "terminated" : "locked";
  return person.is_teacher ? person.employment_status : "working";
};

const STATUS_LABELS = { ...EMPLOYMENT_LABELS, locked: "Đã khóa" };
const STATUS_TONE = { working: "working", on_leave: "leave", suspended: "paused", locked: "paused", terminated: "paused" };

export default function PersonnelManagement({ view = "people" }) {
  const tab = view;
  const [data, setData] = useState({ data: [], roles: [], units: [], can_manage: false, can_assign_roles: false, management_scope: "school" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [keyword, setKeyword] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState(null);
  const tableWrapRef = useRef(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
  const updateScrollEdges = useCallback(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    setScrollEdges({ left: el.scrollLeft > 0, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setData(await apiJson("/api/personnel"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    updateScrollEdges();
    window.addEventListener("resize", updateScrollEdges);
    return () => window.removeEventListener("resize", updateScrollEdges);
  }, [updateScrollEdges, data.data, page, pageSize, tab, keyword, unitFilter, roleFilter, statusFilter]);
  useEffect(() => {
    if (!success) return undefined;
    const timeout = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(timeout);
  }, [success]);
  useEffect(() => {
    if (!error) return undefined;
    const timeout = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timeout);
  }, [error]);

  const unitGroups = useMemo(
    () =>
      data.units
        .filter((unit) => !unit.parent_id)
        .map((root) => ({ root, children: data.units.filter((unit) => unit.parent_id === root.id) })),
    [data.units],
  );
  const orphanUnits = data.units.filter(
    (unit) => unit.parent_id && !data.units.some((root) => root.id === unit.parent_id),
  );

  const filtered = data.data.filter((person) => {
    const text = [person.name, person.email, person.employee_code, person.phone].join(" ").toLowerCase();
    return (
      text.includes(keyword.toLowerCase()) &&
      (unitFilter === "" ||
        (unitFilter === "none" ? person.is_teacher && !person.unit_ids.length : person.unit_path_ids.includes(Number(unitFilter)))) &&
      (roleFilter === "" || (roleFilter === "none" ? !person.roles.length : person.roles.some((role) => role.code === roleFilter))) &&
      (statusFilter === "" || statusOf(person) === statusFilter)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const stats = {
    total: data.data.length,
    teachers: data.data.filter((person) => person.is_teacher).length,
    leaders: data.data.filter((person) => person.roles.some((role) => LEADER_ROLES.includes(role.code))).length,
    working: data.data.filter((person) => statusOf(person) === "working").length,
  };

  const resetFilters = () => {
    setKeyword("");
    setUnitFilter("");
    setRoleFilter("");
    setStatusFilter("");
    setPage(1);
  };
  const filterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };
  const afterSave = async (message) => {
    setEditing(null);
    setSuccess(message);
    await load();
  };

  return (
    <div className="teacher-page personnel-page">
      {success && (
        <div className="success-toast" role="status">
          <span>
            <CheckCircle2 size={20} />
          </span>
          <div>
            <b>Thành công</b>
            <small>{success}</small>
          </div>
          <button aria-label="Đóng thông báo" onClick={() => setSuccess("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {error && (
        <div className="teacher-error-toast" role="alert">
          <span>
            <TriangleAlert size={20} />
          </span>
          <div>
            <b>Không thể thực hiện</b>
            <small>{error}</small>
          </div>
          <button aria-label="Đóng thông báo lỗi" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}


      {tab === "structure" ? (
        <OrgStructure
          onError={setError}
          onChanged={async (message) => {
            setSuccess(message);
            await load();
          }}
        />
      ) : (
        <>
          <section className="teacher-stats">
            <article>
              <span className="icon-bubble purple">
                <Users size={26} strokeWidth={2.1} />
              </span>
              <span>
                <b>{stats.total}</b>
                <small>Tổng nhân sự</small>
                <em>{data.management_scope === "department" ? "Trong đơn vị của bạn" : "Toàn trường"}</em>
              </span>
            </article>
            <article>
              <span className="icon-bubble blue">
                <Building2 size={26} strokeWidth={2.1} />
              </span>
              <span>
                <b>{stats.teachers}</b>
                <small>Giáo viên</small>
                <em>Có hồ sơ giảng dạy</em>
              </span>
            </article>
            <article>
              <span className="icon-bubble orange">
                <UserRoundCog size={26} strokeWidth={2.1} />
              </span>
              <span>
                <b>{stats.leaders}</b>
                <small>Cán bộ quản lý</small>
                <em>Hiệu trưởng, thư ký, tổ/nhóm trưởng</em>
              </span>
            </article>
            <article>
              <span className="icon-bubble green">
                <UserCheck size={26} strokeWidth={2.1} />
              </span>
              <span>
                <b>{stats.working}</b>
                <small>Đang làm việc</small>
                <em>{stats.total ? Math.round((stats.working / stats.total) * 100) : 0}% nhân sự</em>
              </span>
            </article>
          </section>

          <section className="teacher-toolbar-card">
            <div className="teacher-title">
              <div>
                <h2>Danh sách nhân sự</h2>
                <p>Hồ sơ, tổ/nhóm và vai trò của mọi tài khoản trong trường</p>
              </div>
              <div>
                {data.can_manage && (
                  <button className="primary-btn" onClick={() => setEditing({})}>
                    <Plus size={17} /> Thêm nhân sự
                  </button>
                )}
              </div>
            </div>
            <div className="filters personnel-filters">
              <label className="teacher-search">
                <Search size={17} />
                <input value={keyword} onChange={filterChange(setKeyword)} placeholder="Tìm theo tên, mã, email, số điện thoại..." />
              </label>
              <label>
                <Building2 size={15} />
                <select value={unitFilter} onChange={filterChange(setUnitFilter)}>
                  <option value="">Tất cả tổ, nhóm</option>
                  {unitGroups.map(({ root, children }) => (
                    <optgroup key={root.id} label={root.name}>
                      <option value={root.id}>Cả {root.name}</option>
                      {children.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {orphanUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                  <option value="none">Giáo viên chưa thuộc tổ, nhóm</option>
                </select>
              </label>
              <label>
                <ShieldCheck size={15} />
                <select value={roleFilter} onChange={filterChange(setRoleFilter)}>
                  <option value="">Tất cả vai trò</option>
                  {data.roles.map((role) => (
                    <option key={role.id} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                  <option value="none">Chưa có vai trò</option>
                </select>
              </label>
              <label>
                <UserCheck size={15} />
                <select value={statusFilter} onChange={filterChange(setStatusFilter)}>
                  <option value="">Tất cả trạng thái</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="reset-btn" onClick={resetFilters}>
                <RotateCcw size={15} /> Đặt lại
              </button>
            </div>
          </section>

          <section className="teacher-table-card">
            <div
              ref={tableWrapRef}
              onScroll={updateScrollEdges}
              className={`table-wrap personnel-table-wrap ${scrollEdges.left ? "shadow-left" : ""} ${scrollEdges.right ? "shadow-right" : ""}`}
            >
              <table className="personnel-table">
                <thead>
                  <tr>
                    <th>Nhân sự</th>
                    <th>Mã GV</th>
                    <th>Liên hệ</th>
                    <th>Tổ / nhóm</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((person) => {
                    const status = statusOf(person);
                    return (
                      <tr key={person.id}>
                        <td>
                          <div className="teacher-identity">
                            {person.avatar_url ? (
                              <img src={person.avatar_url} alt={`Ảnh của ${person.name}`} />
                            ) : (
                              <span>{person.name.split(" ").at(-1).charAt(0)}</span>
                            )}
                            <div>
                              <b>{person.name}</b>
                              <small>{person.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {person.is_teacher ? <code>{person.employee_code}</code> : <span className="staff-badge">Tài khoản trường</span>}
                        </td>
                        <td>
                          <div className="contact-cell">
                            <span>
                              <Mail size={12} />
                              {person.email}
                            </span>
                            {person.phone && (
                              <span>
                                <Phone size={12} />
                                {person.phone}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          {person.units.length ? (
                            <div className="unit-cell">
                              {person.units.map((unit) => (
                                <span key={unit.id}>{unit.label}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="muted-cell">{person.is_teacher ? "Chưa thuộc tổ/nhóm" : "—"}</span>
                          )}
                        </td>
                        <td>
                          <div className="chip-list">
                            {person.roles.map((role) => (
                              <span key={`${role.role_id}-${role.department_id}`} className={role.code === "giao_vien" ? "soft" : ""}>
                                {role.label}
                              </span>
                            ))}
                            {!person.roles.length && <span className="muted-cell">Chưa có</span>}
                          </div>
                        </td>
                        <td>
                          <span className={`status-chip ${STATUS_TONE[status] ?? "paused"}`}>
                            <i />
                            {STATUS_LABELS[status] ?? status}
                          </span>
                        </td>
                        <td>
                          {data.can_manage ? (
                            <div className="row-actions">
                              <button title="Chỉnh sửa" onClick={() => setEditing(person)}>
                                <Pencil size={15} />
                              </button>
                            </div>
                          ) : (
                            <span className="muted-cell">Chỉ xem</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {loading ? (
                <div className="empty-state">
                  <Activity className="loading-icon" size={36} />
                  <b>Đang tải dữ liệu...</b>
                </div>
              ) : (
                visible.length === 0 && (
                  <div className="empty-state">
                    <UserX size={36} />
                    <b>Không tìm thấy nhân sự</b>
                    <span>Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</span>
                  </div>
                )
              )}
            </div>
            <div className="pagination">
              <span>
                Hiển thị{" "}
                <b>
                  {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filtered.length)}
                </b>{" "}
                trong {filtered.length} kết quả
              </span>
              <div>
                <label>
                  Số dòng{" "}
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option>10</option>
                    <option>20</option>
                    <option>50</option>
                  </select>
                </label>
                <button disabled={safePage === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, index) => (
                  <button key={index} className={safePage === index + 1 ? "active" : ""} onClick={() => setPage(index + 1)}>
                    {index + 1}
                  </button>
                ))}
                <button disabled={safePage === totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {editing && (
        <PersonnelDrawer
          person={editing.id ? editing : null}
          roles={data.roles}
          units={data.units}
          canAssignRoles={data.can_assign_roles}
          canViewEvaluations={data.can_view_evaluations}
          people={data.data}
          onClose={() => setEditing(null)}
          onSaved={afterSave}
          onDeleted={afterSave}
        />
      )}
    </div>
  );
}
