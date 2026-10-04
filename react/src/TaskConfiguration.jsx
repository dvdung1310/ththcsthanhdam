import { useEffect, useState } from "react";
import { CheckCircle2, ListChecks, Pencil, Plus, Power, Trash2, TriangleAlert, X } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import "./TaskConfiguration.css";

export default function TaskConfiguration() {
  const confirm = useConfirm();
  const [types, setTypes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    try {
      const payload = await request();
      setSuccess(payload.message);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const save = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), description: form.get("description") || null };
    run(() =>
      editing.id
        ? apiJson(`/api/task-types/${editing.id}`, { method: "PUT", body: { ...body, is_active: editing.is_active } })
        : apiJson("/api/task-types", { method: "POST", body }),
    );
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

  return (
    <div className="task-type-page">
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
      <section className="task-type-card">
        <div className="task-type-head">
          <div>
            <h2>
              <ListChecks size={20} /> Danh mục nhiệm vụ
            </h2>
            <p>Các loại nhiệm vụ để phân loại công việc khi giao. Gắn loại cho công việc là không bắt buộc.</p>
          </div>
          {!editing && (
            <button className="primary-btn" onClick={() => setEditing({})}>
              <Plus size={16} /> Thêm loại nhiệm vụ
            </button>
          )}
        </div>
        {error && (
          <div className="task-type-error">
            <TriangleAlert size={16} /> {error}
          </div>
        )}
        {editing && (
          <form className="task-type-form" onSubmit={save} key={editing.id ?? "new"}>
            <label>
              Tên loại nhiệm vụ
              <input name="name" required autoFocus maxLength={255} defaultValue={editing.name ?? ""} placeholder="VD: Chuyên môn" />
            </label>
            <label>
              Mô tả
              <textarea name="description" rows="2" maxLength={2000} defaultValue={editing.description ?? ""} placeholder="Mô tả ngắn để người giao việc chọn đúng loại" />
            </label>
            <div className="task-type-form-actions">
              <button type="button" className="secondary-btn" onClick={() => setEditing(null)}>
                Hủy
              </button>
              <button className="primary-btn" disabled={saving}>
                {editing.id ? "Lưu thay đổi" : "Thêm mới"}
              </button>
            </div>
          </form>
        )}
        <div className="task-type-list">
          {types.map((type) => (
            <article key={type.id} className={type.is_active ? "" : "inactive"}>
              <div>
                <b>
                  {type.name}
                  {!type.is_active && <span className="task-type-badge">Ngưng sử dụng</span>}
                </b>
                <p>{type.description || "Chưa có mô tả."}</p>
                <small>{type.tasks_count} công việc</small>
              </div>
              <div className="task-type-actions">
                <button title="Chỉnh sửa" onClick={() => setEditing(type)}>
                  <Pencil size={15} />
                </button>
                <button title={type.is_active ? "Ngưng sử dụng" : "Dùng lại"} onClick={() => toggleActive(type)} disabled={saving}>
                  <Power size={15} />
                </button>
                <button
                  className="delete"
                  title={type.tasks_count ? "Đang được dùng — hãy ngưng sử dụng thay vì xóa" : "Xóa"}
                  disabled={saving || type.tasks_count > 0}
                  onClick={() => remove(type)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
          {!types.length && <p className="task-type-empty">Chưa có loại nhiệm vụ nào.</p>}
        </div>
      </section>
    </div>
  );
}
