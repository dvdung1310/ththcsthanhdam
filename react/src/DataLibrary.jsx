import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Database,
  Eye,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Info,
  Lock,
  Pencil,
  Presentation,
  Scissors,
  Search,
  Share2,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { apiFetch, apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { RichTextEditor } from "./TaskManagement";
import { NameStack } from "./TaskTable";
import LibraryShareDialog, { ACCESS_LABELS } from "./LibraryShareDialog";
import ShareFileDialog from "./ShareFileDialog";
import { formatBytes, openFileInTab } from "./fileUtils";
import "./DataLibrary.css";


function fileIcon(mime = "") {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("sheet") || mime.includes("excel")) return FileSpreadsheet;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return Presentation;
  if (mime.includes("pdf") || mime.includes("word") || mime.startsWith("text/")) return FileText;
  return File;
}

const formatDate = (value) => (value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function DataLibrary() {
  const confirm = useConfirm();
  const [view, setView] = useState("library");
  const [folderId, setFolderId] = useState(null);
  const [payload, setPayload] = useState(null);
  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [menu, setMenu] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page, sort });
    if (folderId) params.set("folder_id", folderId);
    if (search.trim()) params.set("search", search.trim());
    if (fileType) params.set("file_type", fileType);
    try {
      setPayload(await apiJson(`/api/library?${params}`));
    } catch (e) {
      setError(e.message);
      if (folderId) setFolderId(null);
    } finally {
      setLoading(false);
    }
  }, [folderId, search, fileType, sort, page]);

  useEffect(() => {
    if (view !== "library") return undefined;
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, view, search]);
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(timer);
  }, [success]);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  const openFolder = (id) => {
    setView("library");
    setFolderId(id);
    setSearch("");
    setPage(1);
    setSelected(null);
    setDetail(null);
  };

  const canUploadHere = payload ? (payload.folder ? payload.folder.abilities.can_upload : payload.root.can_upload) : false;
  const items = payload ? [...payload.folders, ...payload.data] : [];
  const findItem = (id) => items.find((item) => item.id === id);

  const done = async (message) => {
    setSuccess(message);
    await load();
  };
  const run = async (request) => {
    try {
      const result = await request();
      await done(result.message);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };

  const uploadFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length || !canUploadHere) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    if (folderId) form.append("folder_id", folderId);
    files.forEach((file) => form.append("files[]", file));
    try {
      const response = await apiFetch("/api/library/upload", { method: "POST", headers: { Accept: "application/json" }, body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Object.values(result.errors ?? {}).flat()[0] ?? result.message ?? "Không thể tải file lên.");
      await done(result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submitName = async (event) => {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name")?.toString().trim();
    if (!name) return;
    try {
      const result =
        nameDialog.mode === "create"
          ? await apiJson("/api/library/folders", { method: "POST", body: { parent_id: folderId, name } })
          : await apiJson(`/api/library/nodes/${nameDialog.node.id}`, { method: "PUT", body: { name } });
      setNameDialog(null);
      await done(result.message);
    } catch (e) {
      setNameDialog((current) => ({ ...current, error: e.message }));
    }
  };

  const remove = async (node) => {
    const ok = await confirm({
      tone: "danger",
      title: `Xóa ${node.type === "folder" ? "thư mục" : "file"} “${node.name}”?`,
      message: node.type === "folder" ? "Chỉ xóa được thư mục trống." : "File sẽ bị gỡ khỏi kho. File vẫn được giữ trong các công việc đang dùng nó.",
      confirmText: "Xóa",
    });
    if (ok && (await run(() => apiJson(`/api/library/nodes/${node.id}`, { method: "DELETE" })))) {
      setSelected(null);
      if (detail?.id === node.id) setDetail(null);
    }
  };

  const paste = async () => {
    if (!clipboard) return;
    const ok = await run(() => apiJson("/api/library/paste", { method: "POST", body: { node_id: clipboard.node.id, target_folder_id: folderId, action: clipboard.action } }));
    if (ok && clipboard.action === "cut") setClipboard(null);
  };

  const openFile = (node) => openFileInTab(`/api/library/nodes/${node.id}/download`, node.mime_type).catch((e) => setError(e.message));

  const openContextMenu = (event, node = null) => {
    event.preventDefault();
    event.stopPropagation();
    if (node) setSelected(node.id);
    setMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 320), node });
  };

  useEffect(() => {
    const shortcut = (event) => {
      if (view !== "library" || nameDialog || sharing || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
      const node = selected ? findItem(selected) : null;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "c" && node) {
        event.preventDefault();
        setClipboard({ node, action: "copy" });
        setSuccess("Đã sao chép. Mở thư mục đích và dán (Ctrl+V).");
      }
      if ((event.ctrlKey || event.metaKey) && key === "x" && node?.abilities.can_move) {
        event.preventDefault();
        setClipboard({ node, action: "cut" });
        setSuccess("Đã cắt. Mở thư mục đích và dán (Ctrl+V).");
      }
      if ((event.ctrlKey || event.metaKey) && key === "v" && clipboard && canUploadHere) {
        event.preventDefault();
        paste();
      }
      if (event.key === "Delete" && node?.abilities.can_delete) {
        event.preventDefault();
        remove(node);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  const breadcrumbs = payload?.folder?.breadcrumbs ?? [];

  return (
    <div className="data-library">
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
      <aside className="dl-sidebar">
        <button className={view === "library" && !folderId ? "active" : ""} onClick={() => openFolder(null)}>
          <Database size={17} />
          <span>Kho dữ liệu</span>
        </button>
        <FolderTree tree={payload?.tree ?? []} current={view === "library" ? folderId : null} onOpen={openFolder} />
        <hr />
        <button className={view === "mine" ? "active" : ""} onClick={() => { setView("mine"); setDetail(null); }}>
          <UserRound size={17} />
          <span>Tệp của tôi</span>
        </button>
      </aside>

      {view === "mine" ? (
        <MyFiles onError={setError} onSuccess={setSuccess} error={error} />
      ) : (
        <main className="dl-main">
          <section className="dl-toolbar">
            <nav className="dl-breadcrumbs" aria-label="Đường dẫn">
              <button onClick={() => openFolder(null)}>
                <Database size={15} /> Kho dữ liệu
              </button>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.id}>
                  <ChevronRight size={14} />
                  <button onClick={() => openFolder(crumb.id)}>{crumb.name}</button>
                </span>
              ))}
            </nav>
            <div className="dl-filters">
              <label className="dl-search">
                <Search size={16} />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm trong các mục bạn được xem..." />
              </label>
              <select value={fileType} onChange={(e) => { setFileType(e.target.value); setPage(1); }}>
                <option value="">Mọi loại file</option>
                <option value="pdf">PDF</option>
                <option value="word">Word</option>
                <option value="excel">Excel</option>
                <option value="slide">Trình chiếu</option>
                <option value="image">Hình ảnh</option>
              </select>
              <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="name_asc">Tên A → Z</option>
                <option value="name_desc">Tên Z → A</option>
              </select>
              {canUploadHere && !search && (
                <div className="dl-actions">
                  <button className="secondary-btn" onClick={() => setNameDialog({ mode: "create" })}>
                    <FolderPlus size={16} /> Thư mục mới
                  </button>
                  <button className="primary-btn" onClick={() => fileInput.current?.click()} disabled={uploading}>
                    <Upload size={16} /> {uploading ? "Đang tải lên..." : "Tải file lên"}
                  </button>
                  <input ref={fileInput} type="file" multiple hidden onChange={(e) => uploadFiles(e.target.files)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.zip,.rar" />
                </div>
              )}
            </div>
          </section>

          <section
            className={`dl-content ${dragging ? "dragging" : ""}`}
            onClick={() => setSelected(null)}
            onContextMenu={(e) => openContextMenu(e)}
            onDragOver={(e) => {
              if (!canUploadHere || search) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              uploadFiles(e.dataTransfer.files);
            }}
          >
            {error && (
              <div className="api-error">
                <TriangleAlert size={16} />
                {error}
                <button onClick={load}>Thử lại</button>
              </div>
            )}
            {dragging && <div className="dl-drop-hint"><Upload size={22} /> Thả file để tải lên thư mục này</div>}

            {!!payload?.folders.length && (
              <div className="dl-folder-grid">
                {payload.folders.map((folder) => (
                  <button
                    key={folder.id}
                    className={selected === folder.id ? "selected" : ""}
                    onClick={(e) => { e.stopPropagation(); setSelected(folder.id); }}
                    onDoubleClick={() => openFolder(folder.id)}
                    onContextMenu={(e) => openContextMenu(e, folder)}
                  >
                    <span className={`dl-folder-icon ${folder.is_system ? "system" : ""}`}>
                      <Folder size={22} />
                    </span>
                    <span className="dl-folder-text">
                      <b>{folder.name}</b>
                      <small>
                        {folder.children_count} mục
                        {folder.is_system && " · Thư mục hệ thống"}
                      </small>
                    </span>
                    {!folder.abilities.can_upload && <Lock size={13} className="dl-readonly" aria-label="Chỉ xem" />}
                  </button>
                ))}
              </div>
            )}

            <div className="dl-table-wrap">
              <table className="dl-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Dung lượng</th>
                    <th>Chia sẻ với</th>
                    <th>Người tải lên</th>
                    <th>Cập nhật</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payload?.data.map((node) => {
                    const Icon = fileIcon(node.mime_type);
                    return (
                      <tr
                        key={node.id}
                        className={selected === node.id ? "selected" : ""}
                        onClick={(e) => { e.stopPropagation(); setSelected(node.id); }}
                        onDoubleClick={() => openFile(node)}
                        onContextMenu={(e) => openContextMenu(e, node)}
                      >
                        <td className="dl-name">
                          <Icon size={18} />
                          <span>
                            <b title={node.name}>{node.name}</b>
                            {node.path?.length > 0 && <small>{node.path.map((p) => p.name).join(" › ")}</small>}
                          </span>
                        </td>
                        <td>{formatBytes(node.size)}</td>
                        <td>
                          <NameStack
                            empty="—"
                            items={node.shares.map((share, index) => ({ key: `${index}`, label: `${share.name} · ${ACCESS_LABELS[share.access]}`, kind: share.kind === "unit" ? "unit" : "" }))}
                          />
                        </td>
                        <td>{node.owner?.name ?? "—"}</td>
                        <td>{formatDate(node.updated_at)}</td>
                        <td>
                          <div className="row-actions">
                            <button title="Mở" onClick={(e) => { e.stopPropagation(); openFile(node); }}>
                              <Eye size={15} />
                            </button>
                            <button title="Chi tiết" onClick={(e) => { e.stopPropagation(); setDetail(node); }}>
                              <Info size={15} />
                            </button>
                            {node.abilities.can_share && (
                              <button title="Chia sẻ" onClick={(e) => { e.stopPropagation(); setSharing(node); }}>
                                <Share2 size={15} />
                              </button>
                            )}
                            {node.abilities.can_delete && (
                              <button className="delete" title="Xóa" onClick={(e) => { e.stopPropagation(); remove(node); }}>
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {loading && !payload ? (
                <div className="empty-state"><Database className="loading-icon" size={34} /><b>Đang tải...</b></div>
              ) : (
                payload && !payload.data.length && !payload.folders.length && (
                  <div className="empty-state">
                    <Folder size={34} />
                    <b>{search ? "Không tìm thấy mục phù hợp" : "Thư mục trống"}</b>
                    {canUploadHere && !search && <span>Kéo thả file vào đây hoặc bấm “Tải file lên”.</span>}
                  </div>
                )
              )}
            </div>
            {payload && payload.meta.last_page > 1 && (
              <div className="pagination">
                <span>
                  {payload.meta.total} file · trang {payload.meta.current_page}/{payload.meta.last_page}
                </span>
                <div>
                  <button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
                  <button disabled={page === payload.meta.last_page} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {detail && <NodeDetail key={detail.id} node={detail} onClose={() => setDetail(null)} onOpen={openFile} onShare={setSharing} onSaved={async (message) => { await done(message); }} />}

      {menu && (
        <div className="explorer-context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.node ? (
            <>
              <button onClick={() => { setMenu(null); menu.node.type === "folder" ? openFolder(menu.node.id) : openFile(menu.node); }}><Eye size={16} />Mở</button>
              {menu.node.type === "file" && <button onClick={() => { setMenu(null); setDetail(menu.node); }}><Info size={16} />Chi tiết</button>}
              {menu.node.abilities.can_share && <button onClick={() => { setMenu(null); setSharing(menu.node); }}><Share2 size={16} />Chia sẻ</button>}
              <hr />
              {menu.node.abilities.can_move && <button onClick={() => { setMenu(null); setClipboard({ node: menu.node, action: "cut" }); setSuccess("Đã cắt. Mở thư mục đích và dán."); }}><Scissors size={16} />Cắt <kbd>Ctrl+X</kbd></button>}
              <button onClick={() => { setMenu(null); setClipboard({ node: menu.node, action: "copy" }); setSuccess("Đã sao chép. Mở thư mục đích và dán."); }}><Copy size={16} />Sao chép <kbd>Ctrl+C</kbd></button>
              {menu.node.abilities.can_rename && <button onClick={() => { setMenu(null); setNameDialog({ mode: "rename", node: menu.node }); }}><Pencil size={16} />Đổi tên</button>}
              {menu.node.abilities.can_delete && <button className="danger" onClick={() => { setMenu(null); remove(menu.node); }}><Trash2 size={16} />Xóa <kbd>Del</kbd></button>}
            </>
          ) : (
            <>
              <button disabled={!clipboard || !canUploadHere} onClick={() => { setMenu(null); paste(); }}><ClipboardPaste size={16} />Dán <kbd>Ctrl+V</kbd></button>
              {canUploadHere && (
                <>
                  <hr />
                  <button onClick={() => { setMenu(null); setNameDialog({ mode: "create" }); }}><FolderPlus size={16} />Thư mục mới</button>
                  <button onClick={() => { setMenu(null); fileInput.current?.click(); }}><Upload size={16} />Tải file lên</button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {nameDialog && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setNameDialog(null)}>
          <form className="dl-name-dialog" onSubmit={submitName}>
            <h3>{nameDialog.mode === "create" ? "Tạo thư mục mới" : `Đổi tên ${nameDialog.node.type === "folder" ? "thư mục" : "file"}`}</h3>
            <input name="name" autoFocus required maxLength={nameDialog.node?.type === "file" ? 255 : 150} defaultValue={nameDialog.node?.name ?? ""} placeholder="Nhập tên" onChange={() => nameDialog.error && setNameDialog((c) => ({ ...c, error: "" }))} />
            {nameDialog.error && <p className="dl-dialog-error">{nameDialog.error}</p>}
            <footer>
              <button type="button" className="secondary-btn" onClick={() => setNameDialog(null)}>Hủy</button>
              <button className="primary-btn">{nameDialog.mode === "create" ? "Tạo thư mục" : "Lưu"}</button>
            </footer>
          </form>
        </div>
      )}

      {sharing && (
        <LibraryShareDialog
          node={sharing}
          onClose={() => setSharing(null)}
          onSaved={async (message) => {
            setSharing(null);
            await done(message);
          }}
        />
      )}
    </div>
  );
}

function FolderTree({ tree, current, onOpen, parentId = null, depth = 0 }) {
  const nodes = tree.filter((folder) => folder.parent_id === parentId);
  if (!nodes.length) return null;
  return (
    <div className="dl-tree">
      {nodes.map((folder) => (
        <div key={folder.id}>
          <button className={current === folder.id ? "active" : ""} style={{ paddingLeft: 12 + depth * 14 }} onClick={() => onOpen(folder.id)} title={folder.name}>
            <Folder size={15} className={folder.is_system ? "system" : ""} />
            <span>{folder.name}</span>
          </button>
          <FolderTree tree={tree} current={current} onOpen={onOpen} parentId={folder.id} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}

function NodeDetail({ node, onClose, onOpen, onShare, onSaved }) {
  const [description, setDescription] = useState(node.description || "");
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState("");
  const Icon = fileIcon(node.mime_type);
  const dirty = description !== (node.description || "");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await apiJson(`/api/library/nodes/${node.id}`, { method: "PUT", body: { description } });
      await onSaved(result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const summarize = async () => {
    setSummarizing(true);
    setError("");
    try {
      const result = await apiJson(`/api/library/nodes/${node.id}/ai-summary`, { method: "POST" });
      setDescription(summaryToHtml(result.summary));
    } catch (e) {
      setError(e.message);
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <aside className="dl-detail" aria-label={`Chi tiết ${node.name}`}>
      <header>
        <Icon size={22} />
        <h3 title={node.name}>{node.name}</h3>
        <button onClick={onClose} aria-label="Đóng"><X size={18} /></button>
      </header>
      <dl>
        <div><dt>Dung lượng</dt><dd>{formatBytes(node.size)}</dd></div>
        <div><dt>Người tải lên</dt><dd>{node.owner?.name ?? "—"}</dd></div>
        <div><dt>Cập nhật</dt><dd>{formatDate(node.updated_at)}</dd></div>
        <div><dt>Quyền của bạn</dt><dd>{node.abilities.level >= 4 ? "Quản trị kho" : ["—", "Xem", "Tải lên", "Chỉnh sửa"][node.abilities.level]}</dd></div>
      </dl>
      <div className="dl-detail-actions">
        <button className="secondary-btn" onClick={() => onOpen(node)}><Eye size={15} /> Mở file</button>
        {node.abilities.can_share && <button className="secondary-btn" onClick={() => onShare(node)}><Share2 size={15} /> Chia sẻ</button>}
      </div>
      <section>
        <div className="dl-detail-head">
          <h4>Mô tả</h4>
          {node.abilities.can_edit && (
            <button className="dl-ai" onClick={summarize} disabled={summarizing}>
              <Sparkles size={14} /> {summarizing ? "AI đang đọc file..." : "AI tóm tắt"}
            </button>
          )}
        </div>
        {node.abilities.can_edit ? (
          <RichTextEditor value={description} onChange={setDescription} placeholder="Thêm mô tả hoặc tóm tắt nội dung file..." />
        ) : (
          <div className="dl-description" dangerouslySetInnerHTML={{ __html: description || "<p>Chưa có mô tả.</p>" }} />
        )}
        {error && <p className="dl-dialog-error">{error}</p>}
        {node.abilities.can_edit && (
          <button className="primary-btn dl-save" onClick={save} disabled={!dirty || saving}>{saving ? "Đang lưu..." : "Lưu mô tả"}</button>
        )}
      </section>
    </aside>
  );
}

function MyFiles({ onError, onSuccess, error }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sharing, setSharing] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page });
      if (search.trim()) params.set("search", search.trim());
      setData(await apiJson(`/api/my-files?${params}`));
    } catch (e) {
      onError(e.message);
    }
  }, [page, search, onError]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  return (
    <main className="dl-main">
      <section className="dl-toolbar">
        <div className="dl-mine-head">
          <h2>Tệp của tôi</h2>
          <p>Các file bạn đã đính kèm hoặc nộp trong công việc. Chia sẻ vào kho để người khác dùng lại.</p>
        </div>
        <div className="dl-filters">
          <label className="dl-search">
            <Search size={16} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm theo tên file..." />
          </label>
        </div>
      </section>
      <section className="dl-content">
        {error && <div className="api-error"><TriangleAlert size={16} />{error}</div>}
        <div className="dl-table-wrap">
          <table className="dl-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Nguồn</th>
                <th>Dung lượng</th>
                <th>Ngày tải</th>
                <th>Trong kho</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.data.map((file) => {
                const Icon = fileIcon(file.mime_type);
                return (
                  <tr key={`${file.id}-${file.source}`}>
                    <td className="dl-name">
                      <Icon size={18} />
                      <span><b title={file.name}>{file.name}</b></span>
                    </td>
                    <td>
                      <span className={`dl-source ${file.source}`}>{file.source === "submission" ? "Bài nộp" : "Đính kèm việc"}</span>
                      {file.task && <small className="dl-task-ref">{file.task.code} · {file.task.title}</small>}
                    </td>
                    <td>{formatBytes(file.size)}</td>
                    <td>{formatDate(file.created_at)}</td>
                    <td>{file.shared_count ? <span className="dl-in-library">{file.shared_count} nơi</span> : <span className="name-stack-empty">Chưa</span>}</td>
                    <td>
                      <div className="row-actions">
                        <button title="Mở" onClick={() => openFileInTab(`/api/my-files/${file.id}/download`, file.mime_type).catch((e) => onError(e.message))}>
                          <Eye size={15} />
                        </button>
                        <button
                          title={file.can_share ? "Chia sẻ vào kho dữ liệu" : "Chỉ chia sẻ được bài nộp khi công việc đã hoàn thành"}
                          disabled={!file.can_share}
                          onClick={() => setSharing({ id: file.id, name: file.name })}
                        >
                          <FolderInput size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data && !data.data.length && (
            <div className="empty-state">
              <UserRound size={34} />
              <b>{search ? "Không tìm thấy file" : "Bạn chưa đính kèm hoặc nộp file nào"}</b>
            </div>
          )}
        </div>
        {data && data.meta.last_page > 1 && (
          <div className="pagination">
            <span>{data.meta.total} file · trang {data.meta.current_page}/{data.meta.last_page}</span>
            <div>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
              <button disabled={page === data.meta.last_page} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </section>
      {sharing && (
        <ShareFileDialog
          file={sharing}
          onClose={() => setSharing(null)}
          onDone={async (message) => {
            setSharing(null);
            onSuccess(message);
            await load();
          }}
        />
      )}
    </main>
  );
}

function summaryToHtml(text) {
  const escape = (value) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
  const inline = (value) => escape(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  let html = "";
  let inList = false;
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const item = trimmed.match(/^[-•*]\s+(.+)/);
    if (item) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(item[1])}</li>`;
      return;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    if (trimmed) html += `<p>${inline(trimmed)}</p>`;
  });
  if (inList) html += "</ul>";
  return html;
}
