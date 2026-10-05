import { useEffect, useMemo, useState } from "react";
import { Database, FolderInput, Search, X } from "lucide-react";
import { apiJson } from "./api";
import LibraryFolderTree from "./LibraryFolderTree";
import { useNameConflicts } from "./NameConflictDialog";
import "./ShareFileDialog.css";

export default function ShareFileDialog({ file, onClose, onDone }) {
  const [targets, setTargets] = useState(null);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState(file.name || "");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [askConflicts, conflictDialog] = useNameConflicts();

  useEffect(() => {
    apiJson("/api/library/targets")
      .then((payload) => {
        setTargets(payload);
        const shared = payload.folders.find((f) => f.is_system && f.can_target);
        setSelected(shared ? shared.id : payload.root ? "root" : null);
      })
      .catch((e) => setError(e.message));
  }, []);

  const keyword = search.trim().toLowerCase();
  const matches = useMemo(
    () => (targets && keyword ? targets.folders.filter((f) => f.can_target && f.path.toLowerCase().includes(keyword)) : []),
    [targets, keyword],
  );
  const selectedFolder = targets?.folders.find((f) => f.id === selected);
  const selectedPath = selected === "root" ? "Kho dữ liệu (thư mục gốc)" : selectedFolder?.path;

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = { file_id: file.id, folder_id: selected === "root" ? null : selected, name: name.trim() || null };
    try {
      let payload;
      try {
        payload = await apiJson("/api/library/share-file", { method: "POST", body });
      } catch (e) {
        if (e.status !== 409 || !e.payload.conflict) throw e;
        const answers = await askConflicts([e.payload.conflict]);
        if (!answers || answers[0].resolution === "skip") return;
        payload = await apiJson("/api/library/share-file", { method: "POST", body: { ...body, resolution: answers[0].resolution } });
      }
      onDone?.(payload.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop share-file-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
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
        <div className="sfd-picker">
          <span className="sfd-label">Thư mục đích</span>
          <label className="sfd-search">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm thư mục..." />
          </label>
          <div className="sfd-tree">
            {!targets ? (
              <p className="sfd-empty">{error || "Đang tải thư mục..."}</p>
            ) : keyword ? (
              matches.length ? (
                matches.map((folder) => (
                  <button type="button" key={folder.id} className={`sfd-match ${selected === folder.id ? "selected" : ""}`} onClick={() => setSelected(folder.id)}>
                    {folder.path}
                  </button>
                ))
              ) : (
                <p className="sfd-empty">Không có thư mục phù hợp mà bạn được đặt file vào.</p>
              )
            ) : (
              <LibraryFolderTree
                folders={targets.folders}
                selectedId={selected}
                revealId={typeof selected === "number" ? selected : null}
                onSelect={(folder) => setSelected(folder.id)}
                isDisabled={(folder) => !folder.can_target}
                rootLabel="Kho dữ liệu"
                rootIcon={Database}
                rootSelected={selected === "root"}
                rootDisabled={!targets.root}
                onSelectRoot={() => setSelected("root")}
              />
            )}
          </div>
          <p className="sfd-destination">{selectedPath ? <>Sẽ lưu vào: <b>{selectedPath}</b></> : "Chưa chọn thư mục đích."}</p>
        </div>
        {error && targets && <p className="share-file-error">{error}</p>}
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Hủy
          </button>
          <button className="primary-btn" disabled={saving || !selected}>
            {saving ? "Đang chia sẻ..." : "Chia sẻ"}
          </button>
        </footer>
      </form>
      {conflictDialog}
    </div>
  );
}
