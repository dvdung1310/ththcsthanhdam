import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import { CheckCircle2, Info, Lock, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import "./RolePermissionMatrix.css";
import Dropdown from "./Dropdown";

const MODULE_LABELS = {
  dashboard: "Tổng quan",
  personnel: "Nhân sự",
  tasks: "Công việc",
  library: "Kho dữ liệu",
  evaluation: "Đánh giá thi đua",
  kpi: "Thống kê",
  system: "Hệ thống",
};

const PERMISSION_INFO = {
  "dashboard.view": { hint: "Mở trang Tổng quan số liệu toàn trường." },
  "kpi.view": { hint: "Mở trang Thống kê công việc theo tổ và nhân sự." },
  "personnel.view": { hint: "Xem danh sách nhân sự và cơ cấu tổ, nhóm." },
  "personnel.manage": { hint: "Thêm, sửa hồ sơ và cho nghỉ việc.", requires: ["personnel.view"] },
  "units.manage": { hint: "Tạo, sửa tổ/nhóm và đổi người phụ trách.", requires: ["personnel.view"] },
  "leave.view": { hint: "Xem ngày nghỉ của người khác; ai cũng xem được của mình." },
  "leave.manage": { hint: "Ghi nhận ngày nghỉ cho người khác, kể cả nghỉ không phép." },
  "tasks.view": { hint: "Mở danh sách công việc của mình và việc liên quan." },
  "tasks.assign": { hint: "Tạo, giao, sửa, hủy công việc và duyệt kết quả.", requires: ["tasks.view"] },
  "tasks.update": { hint: "Cập nhật tiến độ và nộp kết quả việc được giao.", requires: ["tasks.view"] },
  "library.view": { hint: "Xem thư mục, file được chia sẻ cho mình." },
  "library.upload": { hint: "Tạo thư mục và tải file ở cấp gốc của kho.", requires: ["library.view"] },
  "library.manage": { hint: "Toàn quyền với mọi thư mục, file trong kho.", requires: ["library.view"] },
  "evaluation.view": { hint: "Tự chấm phiếu thi đua hằng tháng của mình." },
  "evaluation.score": { hint: "Chấm phiếu thi đua cho thành viên trong tổ." },
  "evaluation.manage": { hint: "Mở kỳ, sửa bộ tiêu chí, duyệt, công bố và xem tổng hợp." },
  "roles.manage": { hint: "Mở trang này và đổi quyền của các vai trò." },
  "ai.assistant": { hint: "Dùng khung Trợ lý AI ở góc màn hình." },
  "ai.tasks": { hint: "Tạo công việc từ tài liệu bằng AI.", requires: ["tasks.assign"] },
};

const LOCKED_HINT = "Quản trị viên luôn có toàn bộ quyền, không thể chỉnh sửa.";

const SCOPE_LABELS = { system: "Toàn hệ thống", school: "Toàn trường", self: "Cá nhân" };
const scopeLabel = (role) =>
  role.scope === "unit" ? (role.unit_type === "nhom" ? "Theo nhóm" : "Theo tổ") : SCOPE_LABELS[role.scope];

const closure = (codes, next) => {
  const result = new Set(codes);
  for (let queue = [...codes]; queue.length; ) {
    for (const code of next(queue.pop())) {
      if (!result.has(code)) {
        result.add(code);
        queue.push(code);
      }
    }
  }
  return result;
};
const requirementsOf = (code) => PERMISSION_INFO[code]?.requires ?? [];
const dependentsOf = (code) => Object.keys(PERMISSION_INFO).filter((other) => requirementsOf(other).includes(code));
const quoted = (names) => names.map((name) => `“${name}”`).join(", ");

export default function RolePermissionMatrix() {
  const confirm = useConfirm();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [draft, setDraft] = useState({});
  const [activeRoleId, setActiveRoleId] = useState(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    try {
      const payload = await apiJson("/api/roles");
      setRoles(payload.roles);
      setPermissions(payload.permissions);
      setDraft(Object.fromEntries(payload.roles.map((role) => [role.id, [...role.permission_ids]])));
      setActiveRoleId((current) => current ?? payload.roles.find((role) => !role.locked)?.id ?? null);
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
  const editable = roles.filter((role) => !role.locked);
  const dirtyRoles = editable.filter((role) => !sameSet(draft[role.id] ?? [], role.permission_ids));
  const modules = [...new Set(permissions.map((permission) => permission.module))];
  const byCode = Object.fromEntries(permissions.map((permission) => [permission.code, permission]));
  const activeRole = roles.find((role) => role.id === activeRoleId) ?? editable[0];

  useEffect(() => {
    if (!dirtyRoles.length) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyRoles.length]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRoles.length > 0 && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    (async () => {
      const leave = await confirm({
        tone: "warning",
        icon: TriangleAlert,
        title: "Có thay đổi chưa lưu",
        message: `Quyền của ${dirtyRoles.map((role) => role.name).join(", ")} chưa được lưu. Nếu rời trang, các thay đổi này sẽ mất.`,
        confirmText: "Rời trang",
        cancelText: "Ở lại",
      });
      if (leave) blocker.proceed();
      else blocker.reset();
    })();
  }, [blocker.state]);

  const toggle = (role, permission) => {
    if (role.locked) return;
    const ids = draft[role.id] ?? [];
    const turningOn = !ids.includes(permission.id);
    const linked = [...closure([permission.code], turningOn ? requirementsOf : dependentsOf)]
      .filter((code) => code !== permission.code)
      .map((code) => byCode[code])
      .filter((other) => other && ids.includes(other.id) !== turningOn);
    const changed = new Set([permission.id, ...linked.map((other) => other.id)]);
    setDraft((current) => ({
      ...current,
      [role.id]: turningOn ? [...new Set([...ids, ...changed])] : ids.filter((id) => !changed.has(id)),
    }));
    setNotice(
      linked.length
        ? turningOn
          ? `${role.name}: đã bật kèm ${quoted(linked.map((other) => other.name))} vì “${permission.name}” cần quyền này.`
          : `${role.name}: đã tắt kèm ${quoted(linked.map((other) => other.name))} vì cần “${permission.name}”.`
        : "",
    );
  };

  const reset = () => {
    setDraft(Object.fromEntries(roles.map((role) => [role.id, [...role.permission_ids]])));
    setNotice("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      for (const role of dirtyRoles) {
        await apiJson(`/api/roles/${role.id}/permissions`, { method: "PUT", body: { permission_ids: draft[role.id] } });
      }
      setSuccess(`Đã cập nhật quyền cho ${dirtyRoles.map((role) => role.name).join(", ")}.`);
      setNotice("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const grouped = modules.map((module) => ({
    module,
    label: MODULE_LABELS[module] ?? module,
    items: permissions.filter((permission) => permission.module === module),
  }));

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
          <h2>
            <ShieldCheck size={20} /> Vai trò & quyền
          </h2>
          <p>Tick để cấp quyền cho từng vai trò. Thay đổi có hiệu lực ngay ở lần thao tác tiếp theo của người dùng.</p>
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
                  <th key={role.id} className={role.locked ? "locked" : dirtyRoles.includes(role) ? "dirty" : ""} title={role.locked ? LOCKED_HINT : undefined}>
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
              {grouped.map((group) => (
                <ModuleRows key={group.module} group={group} roles={roles} draft={draft} onToggle={toggle} byCode={byCode} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="role-mobile">
          <div className="role-picker">
            <span>Vai trò</span>
            <Dropdown
              field
              label="Vai trò"
              value={activeRole?.id ?? ""}
              onChange={(value) => setActiveRoleId(Number(value))}
              options={roles.map((role) => ({ value: role.id, label: role.name, hint: role.locked ? "luôn đủ quyền" : `${scopeLabel(role)} · ${role.users_count} người${dirtyRoles.includes(role) ? " · chưa lưu" : ""}` }))}
            />
          </div>
          {activeRole?.locked && (
            <p className="role-locked-note">
              <Lock size={13} /> {LOCKED_HINT}
            </p>
          )}
          {activeRole &&
            grouped.map((group) => (
              <section key={group.module} className="role-group">
                <h3>{group.label}</h3>
                {group.items.map((permission) => {
                  const checked = (draft[activeRole.id] ?? []).includes(permission.id);
                  const changed = checked !== activeRole.permission_ids.includes(permission.id);
                  return (
                    <label key={permission.id} className={`role-switch-row ${changed ? "changed" : ""} ${activeRole.locked ? "locked" : ""}`}>
                      <PermissionText permission={permission} byCode={byCode} />
                      <input type="checkbox" role="switch" checked={checked} disabled={activeRole.locked} onChange={() => toggle(activeRole, permission)} />
                    </label>
                  );
                })}
              </section>
            ))}
        </div>

        {(dirtyRoles.length > 0 || notice) && (
          <div className="matrix-savebar">
            <div>
              {dirtyRoles.length > 0 && <b>Chưa lưu: {dirtyRoles.map((role) => role.name).join(", ")}</b>}
              {notice && (
                <span>
                  <Info size={13} /> {notice}
                </span>
              )}
            </div>
            {dirtyRoles.length > 0 && (
              <>
                <button className="secondary-btn" disabled={saving} onClick={reset}>
                  Hoàn tác
                </button>
                <button className="primary-btn" disabled={saving} onClick={save}>
                  {saving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function PermissionText({ permission, byCode }) {
  const info = PERMISSION_INFO[permission.code];
  const requires = (info?.requires ?? []).map((code) => byCode[code]?.name).filter(Boolean);
  return (
    <span className="perm-text" title={permission.code}>
      <b>{permission.name}</b>
      {info?.hint && <small>{info.hint}</small>}
      {requires.length > 0 && <small className="perm-requires">Cần {quoted(requires)}</small>}
    </span>
  );
}

function ModuleRows({ group, roles, draft, onToggle, byCode }) {
  return (
    <>
      <tr className="module-row">
        <td colSpan={roles.length + 1}>
          <span>{group.label}</span>
        </td>
      </tr>
      {group.items.map((permission) => (
        <tr key={permission.id}>
          <td className="perm-col">
            <PermissionText permission={permission} byCode={byCode} />
          </td>
          {roles.map((role) => {
            const checked = (draft[role.id] ?? []).includes(permission.id);
            const changed = checked !== role.permission_ids.includes(permission.id);
            return (
              <td key={role.id} className={`cell ${changed ? "changed" : ""} ${role.locked ? "locked" : ""}`}>
                <input
                  type="checkbox"
                  aria-label={`${permission.name} — ${role.name}`}
                  checked={role.locked || checked}
                  disabled={role.locked}
                  title={role.locked ? LOCKED_HINT : undefined}
                  onChange={() => onToggle(role, permission)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
