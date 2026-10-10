import { useEffect, useRef, useState } from "react";
import { FolderOpen, Upload, X } from "lucide-react";
import { getUploadLimits, uploadProblem } from "./uploadLimits";
import { fileIcon, fileTone, formatBytes } from "./fileUtils";
import LibraryFilePicker from "./LibraryFilePicker";
import "./TaskDocuments.css";

export default function TaskDocuments({ editing, setEditing, onToggleLibrary, canBrowseLibrary }) {
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
    ...(editing.library_files || [])
      .filter((file) => editing.library_file_ids.includes(file.id))
      .map((file) => ({
        key: `lib-${file.id}`,
        name: file.name,
        size: file.size,
        mime: file.mime_type,
        source: "Kho dữ liệu",
        tone: "shared",
        onRemove: () => onToggleLibrary(file),
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
        {canBrowseLibrary && (
          <button type="button" onClick={() => setPicking(true)}>
            <FolderOpen size={15} />
            Chọn từ Kho dữ liệu
          </button>
        )}
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
        <LibraryFilePicker selected={editing.library_file_ids} onToggle={onToggleLibrary} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
