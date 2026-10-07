import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FolderOpen, Search, Upload, X } from "lucide-react";
import { getUploadLimits, uploadProblem } from "./uploadLimits";
import { fileIcon, fileKind, fileTone, formatBytes } from "./fileUtils";
import "./TaskDocuments.css";

export default function TaskDocuments({ editing, setEditing, libraryOptions, onToggleLibrary }) {
  const inputRef = useRef(null);
  const [warning, setWarning] = useState("");
  const [picking, setPicking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const addFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const limits = await getUploadLimits();
    const incoming = files.filter((file) => file.size <= limits.max_file_bytes);
    setWarning(incoming.length < files.length ? await uploadProblem(files) : "");
    setEditing((current) => ({
      ...current,
      pending_files: [...(current.pending_files || []), ...incoming].filter(
        (file, index, list) => list.findIndex((item) => item.name === file.name && item.size === file.size) === index,
      ),
    }));
  };
  const removePending = (index) =>
    setEditing((current) => ({ ...current, pending_files: (current.pending_files || []).filter((_, i) => i !== index) }));
  const removeAttachment = (id) =>
    setEditing((current) => ({ ...current, removed_attachment_ids: [...(current.removed_attachment_ids || []), id] }));

  const items = [
    ...libraryOptions
      .filter((file) => editing.library_file_ids.includes(file.id))
      .map((file) => ({
        key: `lib-${file.id}`,
        name: file.name,
        size: file.size,
        mime: file.mime_type,
        source: file.in_shared === false ? "Ngoài Chia sẻ chung" : "Chia sẻ chung",
        tone: file.in_shared === false ? "warn" : "shared",
        onRemove: () => onToggleLibrary(file.id),
      })),
    ...(editing.attachments || [])
      .filter((file) => !(editing.removed_attachment_ids || []).includes(file.id))
      .map((file) => ({
        key: `att-${file.id}`,
        name: file.original_name,
        size: file.size,
        mime: file.mime_type,
        source: "Đã tải lên",
        tone: "upload",
        onRemove: () => removeAttachment(file.id),
      })),
    ...(editing.pending_files || []).map((file, index) => ({
      key: `new-${file.name}-${file.size}`,
      name: file.name,
      size: file.size,
      mime: file.type,
      source: "File mới",
      tone: "new",
      onRemove: () => removePending(index),
    })),
  ];

  return (
    <div
      className={`task-docs ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget) && setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      {items.length > 0 ? (
        <ul className="task-docs-list">
          {items.map((item) => {
            const Icon = fileIcon(item.mime || "");
            return (
              <li key={item.key}>
                <i className={`task-docs-icon ${fileTone(item.mime || "")}`}>
                  <Icon size={16} />
                </i>
                <span className="task-docs-name">
                  <b title={item.name}>{item.name}</b>
                  <small>{formatBytes(item.size)}</small>
                </span>
                <em className={`task-docs-source ${item.tone}`}>{item.source}</em>
                <button type="button" className="task-docs-remove" title="Bỏ file" aria-label={`Bỏ ${item.name}`} onClick={item.onRemove}>
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="task-docs-empty">Chưa có tài liệu nào cho công việc này.</p>
      )}
      <div className="task-docs-actions">
        <button type="button" onClick={() => setPicking(true)}>
          <FolderOpen size={15} />
          Chọn từ Chia sẻ chung
        </button>
        <button type="button" onClick={() => inputRef.current?.click()}>
          <Upload size={15} />
          Tải file lên
        </button>
        <small>hoặc kéo thả file vào đây · Tối đa 20MB/file</small>
      </div>
      <input
        ref={inputRef}
        hidden
        multiple
        type="file"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {warning && <p className="attachment-warning" role="alert">{warning}</p>}
      {picking && (
        <SharedFilePicker
          files={libraryOptions}
          selected={editing.library_file_ids}
          onToggle={onToggleLibrary}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function SharedFilePicker({ files, selected, onToggle, onClose }) {
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  useEffect(() => {
    searchRef.current?.focus();
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [onClose]);
  const fold = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const query = fold(search.trim());
  const shown = files.filter((file) => fold(file.name).includes(query));
  const count = files.filter((file) => selected.includes(file.id)).length;

  return createPortal(
    <div className="task-docs-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="task-docs-dialog" role="dialog" aria-modal="true" aria-label="Chọn từ Chia sẻ chung">
        <header>
          <span>
            <b>Chọn từ Chia sẻ chung</b>
            <small>Chỉ gắn được file trong thư mục Chia sẻ chung của Kho dữ liệu.</small>
          </span>
          <button type="button" className="task-docs-close" onClick={onClose} aria-label="Đóng">
            <X size={17} />
          </button>
        </header>
        {files.length > 0 && (
          <label className="task-docs-search">
            <Search size={15} />
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên file..." />
          </label>
        )}
        <div className="task-docs-options">
          {shown.map((file) => {
            const Icon = fileIcon(file.mime_type || "");
            const checked = selected.includes(file.id);
            return (
              <label key={file.id} className={checked ? "checked" : ""}>
                <input type="checkbox" checked={checked} onChange={() => onToggle(file.id)} />
                <span className="task-docs-check">{checked && <Check size={12} strokeWidth={3} />}</span>
                <i className={`task-docs-icon ${fileTone(file.mime_type || "")}`}>
                  <Icon size={16} />
                </i>
                <span className="task-docs-name">
                  <b title={file.name}>{file.name}</b>
                  <small>
                    {fileKind(file.name, file.mime_type || "")} · {formatBytes(file.size)}
                    {file.in_shared === false && <em className="outside-shared"> · ngoài Chia sẻ chung</em>}
                  </small>
                </span>
              </label>
            );
          })}
          {!files.length && (
            <p className="task-docs-none">Chưa có file nào trong thư mục Chia sẻ chung. Quản lý kho có thể tải file lên tại Kho dữ liệu.</p>
          )}
          {files.length > 0 && !shown.length && <p className="task-docs-none">Không tìm thấy file phù hợp.</p>}
        </div>
        <footer>
          <span>
            Đã chọn <b>{count}</b>/{files.length}
          </span>
          <button type="button" className="primary-btn" onClick={onClose}>
            Xong
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
