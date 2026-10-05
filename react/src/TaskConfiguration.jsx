import { useEffect, useState } from "react";
import { CheckCircle2, ListChecks, Pencil, Plus, Power, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { apiJson } from "./api";
import ActionMenu from "./ActionMenu";
import { useConfirm } from "./ConfirmDialog";
import "./TaskConfiguration.css";

const FILTERS = [
  ["", "Tất cả"],
  ["active", "Đang dùng"],
  ["inactive", "Ngưng sử dụng"],
];

export default function TaskConfiguration() {
  const confirm = useConfirm();
  const [types, setTypes] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    try {
      setTypes((await apiJson("/api/task-types")).data);
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

  const run = async (request) => {
    setError("");
    try {
      const payload = await request();
      setSuccess(payload.message);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleActive = (type) =>
    run(() => apiJson(`/api/task-types/${type.id}`, { method: "PUT", body: { name: type.name, description: type.description, is_active: !type.is_active } }));

  const remove = async (type) => {
    const ok = await confirm({
      tone: "danger",
      title: `Xóa loại “${type.name}”?`,
      message: "Loại nhiệm vụ sẽ bị xóa khỏi danh mục.",
      confirmText: "Xóa",
    });
    if (ok) run(() => apiJson(`/api/task-types/${type.id}`, { method: "DELETE" }));
  };

  const list = types ?? [];
  const counts = { "": list.length, active: list.filter((type) => type.is_active).length, inactive: list.filter((type) => !type.is_active).length };
  const keyword = search.trim().toLowerCase();
  const rows = list.filter(
    (type) =>
      (!status || (status === "active") === type.is_active) &&
      (!keyword || `${type.name} ${type.description ?? ""}`.toLowerCase().includes(keyword)),
  );

  return (
    <div className="task-type-page">
      {success && (
        <div className="success-toast" role="status">
          <span><CheckCircle2 size={20} /></span>
          <div>
            <b>Thành công</b>
            <small>{success}</small>
          </div>
          <button onClick={() => setSuccess("")}><X size={17} /></button>
        </div>
      )}

      <section className="task-type-hero">
        <p>Các loại nhiệm vụ dùng để phân loại công việc khi giao. Gắn loại cho công việc là không bắt buộc; loại đã ngưng sử dụng không hiện khi giao việc mới.</p>
        <button className="primary-btn" onClick={() => setEditing({})}>
          <Plus size={16} /> Thêm loại nhiệm vụ
        </button>
      </section>

      {error && (
        <div className="task-type-error">
          <TriangleAlert size={16} /> {error}
          <button onClick={() => setError("")} aria-label="Đóng"><X size={15} /></button>
        </div>
      )}

      <section className="task-type-card">
        <div className="task-type-toolbar">
          <h2><ListChecks size={18} /> Danh mục nhiệm vụ</h2>
          <div className="task-type-chips">
            {FILTERS.map(([value, label]) => (
              <button key={value} className={status === value ? "active" : ""} onClick={() => setStatus(value)}>
                {label} <em>{counts[value]}</em>
              </button>
            ))}
          </div>
          <label className="task-type-search">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm loại nhiệm vụ..." />
          </label>
        </div>

        <table className="task-type-table">
          <thead>
            <tr>
              <th>Loại nhiệm vụ</th>
              <th className="num">Công việc</th>
              <th>Trạng thái</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {rows.map((type) => (
              <tr key={type.id} className={type.is_active ? "" : "inactive"}>
                <td>
                  <b>{type.name}</b>
                  <small>{type.description || "Chưa có mô tả."}</small>
                </td>
                <td className="num">{type.tasks_count}</td>
                <td>
                  <span className={`task-type-status ${type.is_active ? "on" : "off"}`}>{type.is_active ? "Đang dùng" : "Ngưng sử dụng"}</span>
                </td>
                <td className="task-type-actions">
                  <button title="Chỉnh sửa" onClick={() => setEditing(type)}><Pencil size={15} /></button>
                  <ActionMenu
                    items={[
                      { key: "toggle", label: type.is_active ? "Ngưng sử dụng" : "Dùng lại", icon: Power, onClick: () => toggleActive(type) },
                      { divider: true },
                      {
                        key: "delete",
                        label: type.tasks_count ? "Xóa (đang được dùng)" : "Xóa",
                        icon: Trash2,
                        danger: true,
                        disabled: type.tasks_count > 0,
                        onClick: () => remove(type),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {types && !rows.length && (
          <p className="task-type-empty">{list.length ? "Không có loại nhiệm vụ phù hợp." : "Chưa có loại nhiệm vụ nào."}</p>
        )}
        {list.some((type) => type.tasks_count > 0) && (
          <p className="task-type-note">Loại đang được gắn cho công việc không xóa được; hãy chọn “Ngưng sử dụng” để ẩn khỏi danh sách khi giao việc.</p>
        )}
      </section>

      {editing && (
        <TypeDialog
          type={editing}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            setSuccess(message);
            await load();
          }}
        />
      )}
    </div>
  );
}

function TypeDialog({ type, onClose, onSaved }) {
  const [name, setName] = useState(type.name ?? "");
  const [description, setDescription] = useState(type.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return setError("Vui lòng nhập tên loại nhiệm vụ.");
    setSaving(true);
    setError("");
    const body = { name: name.trim(), description: description.trim() || null };
    try {
      const payload = type.id
        ? await apiJson(`/api/task-types/${type.id}`, { method: "PUT", body: { ...body, is_active: type.is_active } })
        : await apiJson("/api/task-types", { method: "POST", body });
      await onSaved(payload.message);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form className="task-type-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="task-type-dialog-title">
        <header>
          <span className="task-type-dialog-icon"><ListChecks size={18} /></span>
          <div>
            <h3 id="task-type-dialog-title">{type.id ? "Sửa loại nhiệm vụ" : "Thêm loại nhiệm vụ"}</h3>
            <p>{type.id ? `${type.tasks_count} công việc đang dùng loại này; đổi tên sẽ áp dụng cho tất cả.` : "Người giao việc chọn loại này khi tạo công việc."}</p>
          </div>
          <button type="button" className="task-type-dialog-close" onClick={onClose} disabled={saving} aria-label="Đóng"><X size={18} /></button>
        </header>
        <label>
          Tên loại nhiệm vụ
          <input value={name} autoFocus maxLength={255} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder="VD: Chuyên môn" />
        </label>
        <label>
          <span>Mô tả <i>(không bắt buộc)</i></span>
          <textarea value={description} rows={3} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả ngắn để người giao việc chọn đúng loại" />
        </label>
        {error && <p className="task-type-dialog-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>Hủy</button>
          <button className="primary-btn" disabled={saving || !name.trim()}>
            {saving ? "Đang lưu..." : type.id ? "Lưu thay đổi" : "Thêm loại"}
          </button>
        </footer>
      </form>
    </div>
  );
}
