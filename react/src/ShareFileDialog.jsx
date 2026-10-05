import { useEffect, useState } from "react";
import { FolderInput, X } from "lucide-react";
import { apiJson } from "./api";
import "./ShareFileDialog.css";

export default function ShareFileDialog({ file, onClose, onDone }) {
  const [targets, setTargets] = useState(null);
  const [folderId, setFolderId] = useState("");
  const [name, setName] = useState(file.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson("/api/library/targets")
      .then((payload) => {
        setTargets(payload);
        setFolderId(payload.data[0]?.id ?? (payload.root ? "root" : ""));
      })
      .catch((e) => setError(e.message));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = await apiJson("/api/library/share-file", {
        method: "POST",
        body: { file_id: file.id, folder_id: folderId === "root" ? null : folderId, name: name.trim() || null },
      });
      onDone?.(payload.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="share-file-dialog" onSubmit={submit}>
        <header>
          <span>
            <FolderInput size={20} />
          </span>
          <div>
            <h3>Chia sẻ vào kho dữ liệu</h3>
            <p>File được đưa vào thư mục đã chọn, không tạo bản sao.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>
        <label>
          Tên hiển thị trong kho
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} />
        </label>
        <label>
          Thư mục đích
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)} disabled={!targets}>
            {targets?.root && <option value="root">Kho dữ liệu (thư mục gốc)</option>}
            {targets?.data.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.path}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="share-file-error">{error}</p>}
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Hủy
          </button>
          <button className="primary-btn" disabled={saving || !targets || folderId === ""}>
            {saving ? "Đang chia sẻ..." : "Chia sẻ"}
          </button>
        </footer>
      </form>
    </div>
  );
}
