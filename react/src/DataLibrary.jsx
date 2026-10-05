import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Database,
  Download,
  Eye,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Globe,
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
  Users,
  X,
} from "lucide-react";
import { apiFetch, apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { RichTextEditor } from "./TaskManagement";
import { NameStack } from "./TaskTable";
import LibraryShareDialog, { ACCESS_LABELS } from "./LibraryShareDialog";
import ShareFileDialog from "./ShareFileDialog";
import { downloadFile, formatBytes, openFileInTab } from "./fileUtils";
import ActionMenu, { MenuList, menuPosition } from "./ActionMenu";
import LibraryFolderTree from "./LibraryFolderTree";
import { useNameConflicts } from "./NameConflictDialog";
import "./DataLibrary.css";


function fileIcon(mime = "") {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("sheet") || mime.includes("excel")) return FileSpreadsheet;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return Presentation;
  if (mime.includes("pdf") || mime.includes("word") || mime.startsWith("text/")) return FileText;
  return File;
}

const SIDEBAR_KEY = "thanhdam_library_sidebar";

function selectBaseName(input, isFile) {
  const dot = isFile ? input.value.lastIndexOf(".") : -1;
  input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
}

const formatDate = (value) => (value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function DataLibrary() {
  const confirm = useConfirm();
  const [askConflicts, conflictDialog] = useNameConflicts();
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
  const uploadTarget = useRef(null);

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

  const folderAbilities = (id) => (id ? payload?.tree.find((f) => f.id === id)?.abilities : null);
  const canUploadTo = (id) => (id === folderId ? canUploadHere : id ? !!folderAbilities(id)?.can_upload : !!payload?.root.can_upload);

  const chooseUploadTarget = (id) => {
    uploadTarget.current = { id };
    fileInput.current?.click();
  };

  const uploadFiles = async (fileList, targetId = folderId) => {
    const files = [...fileList];
    if (!files.length || !canUploadTo(targetId)) return;
    setUploading(true);
    setError("");
    try {
      const checked = await apiJson("/api/library/check-names", { method: "POST", body: { folder_id: targetId, names: files.map((f) => f.name), type: "file" } });
      const conflicts = checked.data.filter((row) => row.conflict);
      const answers = conflicts.length ? await askConflicts(conflicts) : [];
      if (!answers) return;
      if (answers.length && answers.length === files.length && answers.every((a) => a.resolution === "skip")) {
        setSuccess(`Đã bỏ qua ${files.length} file.`);
        return;
      }
      const form = new FormData();
      if (targetId) form.append("folder_id", targetId);
      files.forEach((file) => form.append("files[]", file));
      answers.forEach((a) => form.append(`resolutions[${a.index}]`, a.resolution));
      const response = await apiFetch("/api/library/upload", { method: "POST", headers: { Accept: "application/json" }, body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Object.values(result.errors ?? {}).flat()[0] ?? result.message ?? "Không thể tải file lên.");
      await done(result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      uploadTarget.current = null;
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
          ? await apiJson("/api/library/folders", { method: "POST", body: { parent_id: nameDialog.parentId, name } })
          : await apiJson(`/api/library/nodes/${nameDialog.node.id}`, { method: "PUT", body: { name } });
      setNameDialog(null);
      await done(result.message);
    } catch (e) {
      setNameDialog((current) => ({ ...current, error: e.message, suggested: e.status === 409 ? e.payload.suggested_name : null }));
    }
  };

  const createFolder = async (parentId = folderId) => {
    try {
      const checked = await apiJson("/api/library/check-names", { method: "POST", body: { folder_id: parentId, names: ["Thư mục mới"], type: "folder" } });
      setNameDialog({ mode: "create", parentId, value: checked.data[0].suggested_name });
    } catch {
      setNameDialog({ mode: "create", parentId, value: "Thư mục mới" });
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

  const paste = async (targetId = folderId) => {
    if (!clipboard) return;
    const body = { node_id: clipboard.node.id, target_folder_id: targetId, action: clipboard.action };
    try {
      let result;
      try {
        result = await apiJson("/api/library/paste", { method: "POST", body });
      } catch (e) {
        if (e.status !== 409 || !e.payload.conflict) throw e;
        const answers = await askConflicts([e.payload.conflict]);
        if (!answers || answers[0].resolution === "skip") return;
        result = await apiJson("/api/library/paste", { method: "POST", body: { ...body, resolution: answers[0].resolution } });
      }
      if (clipboard.action === "cut") setClipboard(null);
      await done(result.message);
    } catch (e) {
      setError(e.message);
    }
  };

  const openFile = (node) => openFileInTab(`/api/library/nodes/${node.id}/download`, node.mime_type).catch((e) => setError(e.message));
  const openNode = (node) => (node.type === "folder" ? openFolder(node.id) : openFile(node));
  const copyNode = (node, action) => {
    setClipboard({ node, action });
    setSuccess(action === "cut" ? "Đã cắt. Mở thư mục đích và dán (Ctrl+V)." : "Đã sao chép. Mở thư mục đích và dán (Ctrl+V).");
  };

  const nodeMenu = (node, inTree = false) => [
    { key: "open", label: "Mở", icon: node.type === "folder" ? FolderOpen : Eye, onClick: () => openNode(node) },
    ...(inTree ? targetMenu(node.id, !!node.abilities.can_upload) : []),
    node.type === "file" && { key: "download", label: "Tải về", icon: Download, onClick: () => downloadFile(`/api/library/nodes/${node.id}/download`, node.name).catch((e) => setError(e.message)) },
    { key: "detail", label: "Chi tiết", icon: Info, onClick: () => setDetail(node) },
    node.abilities.can_share && { key: "share", label: "Chia sẻ", icon: Share2, onClick: () => setSharing(node) },
    { key: "d1", divider: true },
    node.abilities.can_move && { key: "cut", label: "Cắt", icon: Scissors, shortcut: "Ctrl+X", onClick: () => copyNode(node, "cut") },
    { key: "copy", label: "Sao chép", icon: Copy, shortcut: "Ctrl+C", onClick: () => copyNode(node, "copy") },
    node.abilities.can_rename && { key: "rename", label: "Đổi tên", icon: Pencil, onClick: () => setNameDialog({ mode: "rename", node }) },
    node.abilities.can_delete && { key: "d2", divider: true },
    node.abilities.can_delete && { key: "delete", label: "Xóa", icon: Trash2, shortcut: "Del", danger: true, onClick: () => remove(node) },
  ];
  const targetMenu = (targetId, allowed) =>
    allowed
      ? [
          { key: "t0", divider: true },
          { key: "folder-here", label: "Thư mục mới ở đây", icon: FolderPlus, onClick: () => createFolder(targetId) },
          { key: "upload-here", label: "Tải file lên vào đây", icon: Upload, onClick: () => chooseUploadTarget(targetId) },
          clipboard && { key: "paste-here", label: `Dán “${clipboard.node.name}” vào đây`, icon: ClipboardPaste, onClick: () => paste(targetId) },
          { key: "t1", divider: true },
        ]
      : [];
  const backgroundMenu = () => [
    { key: "paste", label: clipboard ? `Dán “${clipboard.node.name}”` : "Dán", icon: ClipboardPaste, shortcut: "Ctrl+V", disabled: !clipboard || !canUploadHere, onClick: () => paste() },
    canUploadHere && { key: "d", divider: true },
    canUploadHere && { key: "folder", label: "Thư mục mới", icon: FolderPlus, onClick: () => createFolder() },
    canUploadHere && { key: "upload", label: "Tải file lên", icon: Upload, onClick: () => chooseUploadTarget(folderId) },
  ];
  const rootMenu = () => [
    { key: "open", label: "Mở", icon: FolderOpen, onClick: () => openFolder(null) },
    ...targetMenu(null, !!payload?.root.can_upload),
  ];

  const openContextMenu = (event, node = null) => {
    event.preventDefault();
    event.stopPropagation();
    if (node) setSelected(node.id);
    setMenu({ position: menuPosition(event.clientX, event.clientY), items: node ? nodeMenu(node) : backgroundMenu() });
  };
  const openTreeMenu = (event, folder) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ position: menuPosition(event.clientX, event.clientY), items: folder ? nodeMenu(folder, true) : rootMenu() });
  };

  useEffect(() => {
    const shortcut = (event) => {
      if (view !== "library" || nameDialog || sharing || conflictDialog || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
      const node = selected ? findItem(selected) : null;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "c" && node) {
        event.preventDefault();
        copyNode(node, "copy");
      }
      if ((event.ctrlKey || event.metaKey) && key === "x" && node?.abilities.can_move) {
        event.preventDefault();
        copyNode(node, "cut");
      }
      if ((event.ctrlKey || event.metaKey) && key === "v" && clipboard && canUploadHere) {
        event.preventDefault();
        paste();
      }
      if (event.key === "Delete" && node?.abilities.can_delete) {
        event.preventDefault();
        remove(node);
      }
      if (event.key === "Enter" && node) {
        event.preventDefault();
        openNode(node);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_KEY)) || 260);
  useEffect(() => localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth)), [sidebarWidth]);
  const startResize = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const move = (e) => setSidebarWidth(Math.min(460, Math.max(190, startWidth + e.clientX - startX)));
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.classList.remove("dl-resizing");
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.body.classList.add("dl-resizing");
  };

  const breadcrumbs = payload?.folder?.breadcrumbs ?? [];
  const showFolders = payload && (payload.meta.current_page === 1 || !payload.data.length) ? payload.folders : [];

  return (
    <div className="data-library" style={{ gridTemplateColumns: `${sidebarWidth}px 8px minmax(0, 1fr)` }}>
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
        <div className="dl-sidebar-scroll">
          <LibraryFolderTree
            folders={payload?.tree ?? []}
            selectedId={view === "library" ? folderId : null}
            revealId={view === "library" ? folderId : null}
            onSelect={(folder) => openFolder(folder.id)}
            storageKey="thanhdam_library_tree"
            rootLabel="Kho dữ liệu"
            rootIcon={Database}
            rootSelected={view === "library" && !folderId}
            onSelectRoot={() => openFolder(null)}
            rootCollapsible
            onContextMenu={openTreeMenu}
          />
          <div className={`lft-row root dl-mine-root ${view === "mine" ? "selected" : ""}`}>
            <span className="lft-toggle-spacer" />
            <button type="button" className="lft-label" onClick={() => { setView("mine"); setDetail(null); }}>
              <UserRound size={16} />
              <span>Tệp của tôi</span>
            </button>
          </div>
        </div>
      </aside>
      <div className="dl-splitter" onMouseDown={startResize} onDoubleClick={() => setSidebarWidth(260)} role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng" />

      {view === "mine" ? (
        <MyFiles
          onError={setError}
          onSuccess={setSuccess}
          error={error}
          onOpenLocation={(location) => {
            openFolder(location.folder_id);
            setSelected(location.node_id);
          }}
        />
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
                  <button className="secondary-btn" onClick={() => createFolder()}>
                    <FolderPlus size={16} /> Thư mục mới
                  </button>
                  <button className="primary-btn" onClick={() => chooseUploadTarget(folderId)} disabled={uploading}>
                    <Upload size={16} /> {uploading ? "Đang tải lên..." : "Tải file lên"}
                  </button>
                </div>
              )}
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => uploadFiles(e.target.files, uploadTarget.current ? uploadTarget.current.id : folderId)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.zip,.rar" />
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
              uploadFiles(e.dataTransfer.files, folderId);
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

            <table className="dl-table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Kích thước</th>
                  <th>Chia sẻ với</th>
                  <th className="dl-col-optional">Chủ sở hữu</th>
                  <th className="dl-col-optional">Cập nhật</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {[...showFolders, ...(payload?.data ?? [])].map((node) => {
                  const isFolder = node.type === "folder";
                  const Icon = isFolder ? Folder : fileIcon(node.mime_type);
                  return (
                    <tr
                      key={node.id}
                      className={`${selected === node.id ? "selected" : ""} ${isFolder ? "folder" : ""}`}
                      onClick={(e) => { e.stopPropagation(); setSelected(node.id); }}
                      onDoubleClick={() => openNode(node)}
                      onContextMenu={(e) => openContextMenu(e, node)}
                    >
                      <td className="dl-name">
                        <span className={`dl-node-icon ${isFolder ? (node.is_system ? "system" : "folder") : "file"}`}>
                          <Icon size={17} />
                        </span>
                        <span className="dl-name-text">
                          <b title={node.name}>{node.name}</b>
                          {node.path?.length > 0 && <small>{node.path.map((p) => p.name).join(" › ")}</small>}
                          {isFolder && node.is_system && <small>Thư mục hệ thống</small>}
                        </span>
                        {isFolder && !node.abilities.can_upload && <Lock size={12} className="dl-readonly" aria-label="Chỉ xem" />}
                      </td>
                      <td className="dl-muted">{isFolder ? `${node.children_count ?? 0} mục` : formatBytes(node.size)}</td>
                      <td>
                        <NameStack
                          empty="—"
                          items={node.shares.map((share, index) => ({ key: `${index}`, label: `${share.name} · ${ACCESS_LABELS[share.access]}`, kind: share.kind === "unit" ? "unit" : "" }))}
                        />
                      </td>
                      <td className="dl-col-optional dl-muted">{node.owner?.name ?? "—"}</td>
                      <td className="dl-col-optional dl-muted">{formatDate(node.updated_at)}</td>
                      <td className="dl-row-menu" onClick={(e) => e.stopPropagation()}>
                        <ActionMenu items={nodeMenu(node)} />
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
          </section>
          {payload && payload.meta.last_page > 1 && (
            <footer className="dl-pagination">
              <span>
                {payload.meta.total} file · trang {payload.meta.current_page}/{payload.meta.last_page}
              </span>
              <div>
                <button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
                <button disabled={page === payload.meta.last_page} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
              </div>
            </footer>
          )}
        </main>
      )}

      {detail && (
        <NodeDetail
          key={detail.id}
          node={detail}
          reloadToken={payload}
          onClose={() => setDetail(null)}
          onOpen={openFile}
          onDownload={(node) => downloadFile(`/api/library/nodes/${node.id}/download`, node.name).catch((e) => setError(e.message))}
          onOpenFolder={openFolder}
          onShare={setSharing}
          onSaved={done}
        />
      )}

      {menu && <MenuList items={menu.items} position={menu.position} onClose={() => setMenu(null)} />}

      {nameDialog && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setNameDialog(null)}>
          <form className="dl-name-dialog" onSubmit={submitName}>
            <h3>{nameDialog.mode === "create" ? "Tạo thư mục mới" : `Đổi tên ${nameDialog.node.type === "folder" ? "thư mục" : "file"}`}</h3>
            <input name="name" autoFocus required maxLength={nameDialog.node?.type === "file" ? 255 : 150} value={nameDialog.value ?? nameDialog.node?.name ?? ""} placeholder="Nhập tên" onFocus={(e) => selectBaseName(e.target, nameDialog.node?.type === "file")} onChange={(e) => setNameDialog((c) => ({ ...c, value: e.target.value, error: "", suggested: null }))} />
            {nameDialog.error && (
              <p className="dl-dialog-error">
                {nameDialog.error}
                {nameDialog.suggested && (
                  <button type="button" onClick={() => setNameDialog((c) => ({ ...c, value: c.suggested, error: "", suggested: null }))}>
                    Dùng tên “{nameDialog.suggested}”
                  </button>
                )}
              </p>
            )}
            <footer>
              <button type="button" className="secondary-btn" onClick={() => setNameDialog(null)}>Hủy</button>
              <button className="primary-btn">{nameDialog.mode === "create" ? "Tạo thư mục" : "Lưu"}</button>
            </footer>
          </form>
        </div>
      )}

      {conflictDialog}

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

const fullDate = (value) => (value ? new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

function fileKind(name = "", mime = "") {
  const extension = name.includes(".") ? name.split(".").pop().toUpperCase() : "";
  if (mime.startsWith("image/")) return `Hình ảnh ${extension}`.trim();
  if (mime.includes("pdf")) return "Tài liệu PDF";
  if (mime.includes("word")) return "Tài liệu Word";
  if (mime.includes("sheet") || mime.includes("excel")) return "Bảng tính Excel";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "Bản trình chiếu";
  if (mime.startsWith("text/")) return "Văn bản thuần";
  return extension ? `Tệp ${extension}` : "Tệp";
}

function PersonAvatar({ person, size = 26 }) {
  const initial = person?.name?.trim().split(/\s+/).at(-1)?.charAt(0).toUpperCase() ?? "?";
  return person?.avatar_url ? (
    <img className="dl-avatar" src={person.avatar_url} alt="" style={{ width: size, height: size }} />
  ) : (
    <i className="dl-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</i>
  );
}

function PersonLine({ person, note }) {
  if (!person) return <span className="dl-muted">—</span>;
  return (
    <span className="dl-person">
      <PersonAvatar person={person} />
      <span>
        <b>{person.name}</b>
        {note && <small>{note}</small>}
      </span>
    </span>
  );
}

function DetailHeader({ icon: Icon, tone, title, subtitle, onClose }) {
  return (
    <header className="dl-detail-header">
      <span className={`dl-detail-icon ${tone}`}><Icon size={24} /></span>
      <div>
        <h3 title={title}>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <button onClick={onClose} aria-label="Đóng"><X size={18} /></button>
    </header>
  );
}

function InfoRows({ rows }) {
  return (
    <dl className="dl-info">
      {rows.filter(Boolean).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const LEVEL_LABELS = ["—", "Xem", "Tải lên", "Chỉnh sửa", "Quản trị kho"];

function NodeDetail({ node: initial, reloadToken, onClose, onOpen, onDownload, onOpenFolder, onShare, onSaved }) {
  const [node, setNode] = useState(initial);
  const [description, setDescription] = useState(initial.description || "");
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState("");
  const isFolder = node.type === "folder";
  const Icon = isFolder ? Folder : fileIcon(node.mime_type);
  const dirty = description !== (node.description || "");

  useEffect(() => {
    let active = true;
    apiJson(`/api/library/nodes/${initial.id}`)
      .then((payload) => active && setNode(payload.data))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [initial.id, reloadToken]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await apiJson(`/api/library/nodes/${node.id}`, { method: "PUT", body: { description } });
      setNode((current) => ({ ...current, ...result.data, stats: current.stats, uploader: current.uploader }));
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

  const location = ["Kho dữ liệu", ...(node.path ?? []).map((p) => p.name)].join(" › ");
  const stats = node.stats;
  const subtitle = isFolder ? (node.is_system ? "Thư mục hệ thống" : "Thư mục") : `${fileKind(node.name, node.mime_type)} · ${formatBytes(node.size)}`;
  const showUploader = !isFolder && node.uploader && node.uploader.id !== node.owner?.id;

  return (
    <aside className="dl-detail" aria-label={`Chi tiết ${node.name}`}>
      <DetailHeader icon={Icon} tone={isFolder ? (node.is_system ? "system" : "folder") : "file"} title={node.name} subtitle={subtitle} onClose={onClose} />
      <div className="dl-detail-actions">
        {isFolder ? (
          <button className="secondary-btn" onClick={() => onOpenFolder(node.id)}><FolderOpen size={15} /> Mở thư mục</button>
        ) : (
          <>
            <button className="secondary-btn" onClick={() => onOpen(node)}><Eye size={15} /> Mở file</button>
            <button className="secondary-btn" onClick={() => onDownload(node)}><Download size={15} /> Tải về</button>
          </>
        )}
        {node.abilities.can_share && <button className="secondary-btn" onClick={() => onShare(node)}><Share2 size={15} /> Chia sẻ</button>}
      </div>

      <section>
        <div className="dl-detail-head"><h4>Thông tin</h4></div>
        <InfoRows
          rows={[
            isFolder
              ? ["Nội dung", stats ? `${stats.folders} thư mục · ${stats.files} file` : `${node.children_count ?? 0} mục`]
              : ["Loại", fileKind(node.name, node.mime_type)],
            isFolder ? ["Tổng dung lượng", stats ? formatBytes(stats.size) : "—"] : ["Dung lượng", formatBytes(node.size)],
            ["Vị trí", <span className="dl-location-text" title={location}>{location}</span>],
            ["Chủ sở hữu", <PersonLine person={node.owner} />],
            showUploader && ["Người tải file lên", <PersonLine person={node.uploader} />],
            ["Ngày tạo", fullDate(node.created_at)],
            ["Cập nhật lần cuối", fullDate(node.updated_at)],
            node.updated_by && ["Người cập nhật cuối", <PersonLine person={node.updated_by} />],
            ["Quyền của bạn", LEVEL_LABELS[node.abilities.level] ?? "—"],
          ]}
        />
      </section>

      <section>
        <div className="dl-detail-head">
          <h4>Người có quyền truy cập</h4>
          {node.abilities.can_share && <button className="dl-link-btn" onClick={() => onShare(node)}>Quản lý</button>}
        </div>
        <ul className="dl-access-list">
          {node.owner && (
            <li>
              <PersonAvatar person={node.owner} size={30} />
              <span>{node.owner.name}</span>
              <small>Chủ sở hữu</small>
            </li>
          )}
          {node.shares.map((share, index) => (
            <li key={index}>
              {share.kind === "user" ? (
                <PersonAvatar person={share} size={30} />
              ) : (
                <i className={`dl-avatar ${share.kind}`} style={{ width: 30, height: 30 }}>{share.kind === "unit" ? <Users size={15} /> : <Globe size={15} />}</i>
              )}
              <span>{share.name}</span>
              <small>{ACCESS_LABELS[share.access]}</small>
            </li>
          ))}
        </ul>
        {!node.shares.length && <p className="dl-detail-note">Chưa chia sẻ riêng. {node.parent_id ? "Quyền được kế thừa từ thư mục cha." : ""}</p>}
      </section>

      <section>
        <div className="dl-detail-head">
          <h4>Mô tả</h4>
          {!isFolder && node.abilities.can_edit && (
            <button className="dl-ai" onClick={summarize} disabled={summarizing}>
              <Sparkles size={14} /> {summarizing ? "AI đang đọc file..." : "AI tóm tắt"}
            </button>
          )}
        </div>
        {node.abilities.can_edit ? (
          <RichTextEditor value={description} onChange={setDescription} placeholder={isFolder ? "Thêm mô tả cho thư mục..." : "Thêm mô tả hoặc tóm tắt nội dung file..."} />
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

const SOURCE_LABELS = { attachment: "Tài liệu giao việc", submission: "Bài nộp" };
const TASK_STATUS = { not_started: "Chưa thực hiện", in_progress: "Đang thực hiện", waiting_approval: "Chờ duyệt", completed: "Hoàn thành", cancelled: "Đã hủy" };

function MyFiles({ onError, onSuccess, error, onOpenLocation }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [fileType, setFileType] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [menu, setMenu] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [detailKey, setDetailKey] = useState(null);

  const load = useCallback(async () => {
    onError("");
    try {
      const params = new URLSearchParams({ page, sort });
      if (search.trim()) params.set("search", search.trim());
      if (source) params.set("source", source);
      if (status) params.set("status", status);
      if (fileType) params.set("file_type", fileType);
      setData(await apiJson(`/api/my-files?${params}`));
    } catch (e) {
      onError(e.message);
    }
  }, [page, sort, search, source, status, fileType, onError]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const filter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };
  const rowKey = (file) => `${file.id}-${file.source}`;
  const url = (file) => `/api/my-files/${file.id}/download`;
  const openFile = (file) => openFileInTab(url(file), file.mime_type).catch((e) => onError(e.message));
  const download = (file) => downloadFile(url(file), file.name).catch((e) => onError(e.message));
  const share = (file) => setSharing({ id: file.id, name: file.name });
  const detailFile = detailKey ? data?.data.find((file) => rowKey(file) === detailKey) : null;

  const fileMenu = (file) => [
    { key: "open", label: "Mở", icon: Eye, onClick: () => openFile(file) },
    { key: "download", label: "Tải về", icon: Download, onClick: () => download(file) },
    { key: "detail", label: "Chi tiết", icon: Info, onClick: () => setDetailKey(rowKey(file)) },
    { key: "d1", divider: true },
    { key: "share", label: file.can_share ? "Chia sẻ vào kho" : "Chia sẻ vào kho (chờ việc hoàn thành)", icon: FolderInput, disabled: !file.can_share, onClick: () => share(file) },
    ...file.locations
      .filter((location) => location.can_open)
      .slice(0, 3)
      .map((location) => ({ key: `loc-${location.node_id}`, label: `Xem trong “${location.folder_name}”`, icon: FolderOpen, onClick: () => onOpenLocation(location) })),
  ];

  const openContextMenu = (event, file) => {
    event.preventDefault();
    setSelected(rowKey(file));
    setMenu({ position: menuPosition(event.clientX, event.clientY), items: fileMenu(file) });
  };

  return (
    <main className="dl-main">
      <section className="dl-toolbar">
        <nav className="dl-breadcrumbs" aria-label="Đường dẫn">
          <button type="button" title="File bạn đã đính kèm khi giao việc hoặc nộp khi hoàn thành việc">
            <UserRound size={15} /> Tệp của tôi
          </button>
        </nav>
        <div className="dl-filters">
          <label className="dl-search">
            <Search size={16} />
            <input value={search} onChange={filter(setSearch)} placeholder="Tìm theo tên file..." />
          </label>
          <select value={source} onChange={filter(setSource)}>
            <option value="">Mọi nguồn</option>
            <option value="attachment">Tài liệu giao việc</option>
            <option value="submission">Bài nộp</option>
          </select>
          <select value={status} onChange={filter(setStatus)}>
            <option value="">Mọi trạng thái</option>
            <option value="shared">Đã ở trong kho</option>
            <option value="unshared">Chưa chia sẻ</option>
            <option value="pending">Chờ việc hoàn thành</option>
          </select>
          <select value={fileType} onChange={filter(setFileType)}>
            <option value="">Mọi loại file</option>
            <option value="pdf">PDF</option>
            <option value="word">Word</option>
            <option value="excel">Excel</option>
            <option value="slide">Trình chiếu</option>
            <option value="image">Hình ảnh</option>
          </select>
          <select value={sort} onChange={filter(setSort)}>
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="name_asc">Tên A → Z</option>
            <option value="name_desc">Tên Z → A</option>
            <option value="size_desc">Dung lượng lớn nhất</option>
          </select>
        </div>
      </section>
      <section className="dl-content" onClick={() => setSelected(null)}>
        {error && <div className="api-error"><TriangleAlert size={16} />{error}<button onClick={load}>Thử lại</button></div>}
        <table className="dl-table dl-mine-table">
          <thead>
            <tr>
              <th>Tên</th>
              <th className="dl-col-optional">Công việc</th>
              <th className="dl-col-optional">Kích thước</th>
              <th>Trong kho</th>
              <th className="dl-col-optional">Ngày tải</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {data?.data.map((file) => {
              const Icon = fileIcon(file.mime_type);
              const [first, ...others] = file.locations;
              return (
                <tr
                  key={rowKey(file)}
                  className={selected === rowKey(file) ? "selected" : ""}
                  onClick={(e) => { e.stopPropagation(); setSelected(rowKey(file)); }}
                  onDoubleClick={() => openFile(file)}
                  onContextMenu={(e) => openContextMenu(e, file)}
                >
                  <td className="dl-name">
                    <span className="dl-node-icon file"><Icon size={17} /></span>
                    <span className="dl-name-text">
                      <b title={file.name}>{file.name}</b>
                      <small><span className={`dl-source ${file.source}`}>{SOURCE_LABELS[file.source]}</span></small>
                    </span>
                  </td>
                  <td className="dl-col-optional dl-task-cell" title={file.task ? `${file.task.code} · ${file.task.title}` : undefined}>
                    {file.task ? <><b>{file.task.code}</b> · {file.task.title}</> : <span className="dl-muted">Công việc đã bị xóa</span>}
                  </td>
                  <td className="dl-col-optional dl-muted">{formatBytes(file.size)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {first ? (
                      <span className="dl-locations">
                        {first.can_open ? (
                          <button type="button" className="dl-location" onClick={() => onOpenLocation(first)} title={`Mở thư mục “${first.folder_name}”`}>
                            <Folder size={13} /> {first.folder_name}
                          </button>
                        ) : (
                          <span className="dl-location locked" title="Bạn không còn quyền xem thư mục này"><Lock size={12} /> {first.folder_name}</span>
                        )}
                        {others.length > 0 && <span className="dl-location-more" title={others.map((o) => o.folder_name).join(", ")}>+{others.length}</span>}
                      </span>
                    ) : file.can_share ? (
                      <span className="name-stack-empty">Chưa chia sẻ</span>
                    ) : (
                      <span className="dl-pending" title="Bài nộp chỉ chia sẻ được khi công việc đã hoàn thành">Chờ việc hoàn thành</span>
                    )}
                  </td>
                  <td className="dl-col-optional dl-muted">{formatDate(file.created_at)}</td>
                  <td className="dl-row-menu" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu items={fileMenu(file)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data ? (
          !error && <div className="empty-state"><UserRound className="loading-icon" size={34} /><b>Đang tải...</b></div>
        ) : (
          !data.data.length && (
            <div className="empty-state">
              <UserRound size={34} />
              <b>{search || source || status || fileType ? "Không có file phù hợp" : "Bạn chưa đính kèm hoặc nộp file nào"}</b>
              {!(search || source || status || fileType) && <span>File bạn đính kèm khi giao việc hoặc nộp khi hoàn thành việc sẽ hiện ở đây.</span>}
            </div>
          )
        )}
      </section>
      {data && data.meta.last_page > 1 && (
        <footer className="dl-pagination">
          <span>{data.meta.total} file · trang {data.meta.current_page}/{data.meta.last_page}</span>
          <div>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
            <button disabled={page === data.meta.last_page} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
          </div>
        </footer>
      )}
      {menu && <MenuList items={menu.items} position={menu.position} onClose={() => setMenu(null)} />}
      {detailFile && (
        <MyFileDetail key={detailKey} file={detailFile} onClose={() => setDetailKey(null)} onOpen={openFile} onDownload={download} onShare={share} onOpenLocation={onOpenLocation} />
      )}
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

function MyFileDetail({ file, onClose, onOpen, onDownload, onShare, onOpenLocation }) {
  return (
    <aside className="dl-detail" aria-label={`Chi tiết ${file.name}`}>
      <DetailHeader icon={fileIcon(file.mime_type)} tone="file" title={file.name} subtitle={`${fileKind(file.name, file.mime_type)} · ${formatBytes(file.size)}`} onClose={onClose} />
      <div className="dl-detail-actions">
        <button className="secondary-btn" onClick={() => onOpen(file)}><Eye size={15} /> Mở file</button>
        <button className="secondary-btn" onClick={() => onDownload(file)}><Download size={15} /> Tải về</button>
        {file.can_share && <button className="secondary-btn" onClick={() => onShare(file)}><FolderInput size={15} /> Chia sẻ vào kho</button>}
      </div>
      <section>
        <div className="dl-detail-head"><h4>Thông tin</h4></div>
        <InfoRows
          rows={[
            ["Nguồn", <span className={`dl-source ${file.source}`}>{SOURCE_LABELS[file.source]}</span>],
            ["Loại", fileKind(file.name, file.mime_type)],
            ["Dung lượng", formatBytes(file.size)],
            ["Ngày tải lên", fullDate(file.created_at)],
          ]}
        />
      </section>
      <section>
        <div className="dl-detail-head"><h4>Công việc</h4></div>
        {file.task ? (
          <div className="dl-detail-task">
            <b>{file.task.code}</b>
            <span>{file.task.title}</span>
            <small className={`dl-task-status ${file.task.status}`}>{TASK_STATUS[file.task.status] ?? file.task.status}</small>
          </div>
        ) : (
          <p className="dl-detail-note">Công việc chứa file này đã bị xóa.</p>
        )}
      </section>
      <section>
        <div className="dl-detail-head"><h4>Trong kho dữ liệu</h4></div>
        {file.locations.length ? (
          <ul className="dl-detail-locations">
            {file.locations.map((location) => (
              <li key={location.node_id}>
                {location.can_open ? (
                  <button type="button" onClick={() => onOpenLocation(location)}><Folder size={15} /> {location.folder_name}</button>
                ) : (
                  <span title="Bạn không còn quyền xem thư mục này"><Lock size={14} /> {location.folder_name}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="dl-detail-note">
            {file.can_share ? "Chưa chia sẻ vào kho. Chia sẻ để đồng nghiệp tìm và dùng lại file này." : "Bài nộp chỉ chia sẻ vào kho được khi công việc đã hoàn thành."}
          </p>
        )}
      </section>
    </aside>
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
