import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Folder, HardDrive, LoaderCircle, Search, X } from "lucide-react";
import { apiJson } from "./api";
import LibraryFolderTree from "./LibraryFolderTree";
import { fileIcon, fileKind, fileTone, formatBytes } from "./fileUtils";
import "./TaskDocuments.css";
import "./LibraryFilePicker.css";

const PER_PAGE = 50;

export default function LibraryFilePicker({ title = "Chọn từ Kho dữ liệu", note, selected, onToggle, onClose, blockedReason }) {
  const [tree, setTree] = useState([]);
  const [folder, setFolder] = useState(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const searchRef = useRef(null);
  const request = useRef(0);

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

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (page = 1) => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ per_page: PER_PAGE, page, sort: "name_asc" });
    if (query) params.set("search", query);
    else if (folder) params.set("folder_id", folder.id);
    try {
      const result = await apiJson(`/api/library?${params}`);
      if (id !== request.current) return;
      setTree(result.tree ?? []);
      setListing((current) => ({
        breadcrumbs: result.folder?.breadcrumbs ?? [],
        folders: query ? [] : result.folders,
        files: page > 1 && current ? [...current.files, ...result.data] : result.data,
        meta: result.meta,
      }));
    } catch (e) {
      if (id === request.current) setError(e.status === 403 ? "Bạn không có quyền xem thư mục này." : e.message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [folder, query]);

  useEffect(() => {
    load();
  }, [load]);

  const open = (node) => {
    setSearch("");
    setQuery("");
    setFolder(node);
  };
  const files = listing?.files ?? [];
  const more = listing && listing.meta.current_page < listing.meta.last_page;

  return createPortal(
    <div className="task-docs-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="task-docs-dialog lfp-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>
            <b>{title}</b>
            <small>{note ?? "Người thực hiện và người duyệt xem được file đã gắn qua công việc, kể cả khi họ không có quyền trong thư mục."}</small>
          </span>
          <button type="button" className="task-docs-close" onClick={onClose} aria-label="Đóng">
            <X size={17} />
          </button>
        </header>
        <label className="task-docs-search">
          <Search size={15} />
          <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm file trong toàn bộ Kho dữ liệu bạn được xem..." />
        </label>
        <div className="lfp-body">
          <aside className="lfp-tree">
            <LibraryFolderTree
              folders={tree}
              selectedId={query ? null : folder?.id ?? null}
              onSelect={open}
              revealId={folder?.id}
              rootLabel="Kho dữ liệu"
              rootIcon={HardDrive}
              rootSelected={!query && !folder}
              onSelectRoot={() => open(null)}
            />
          </aside>
          <section className="lfp-list">
            <nav className="lfp-crumbs">
              {query ? (
                <span>Kết quả tìm “{query}”</span>
              ) : (
                <>
                  <button type="button" onClick={() => open(null)}>Kho dữ liệu</button>
                  {(listing?.breadcrumbs ?? []).map((crumb) => (
                    <span key={crumb.id}>
                      <ChevronRight size={13} />
                      <button type="button" onClick={() => open(tree.find((node) => node.id === crumb.id) ?? crumb)}>{crumb.name}</button>
                    </span>
                  ))}
                </>
              )}
            </nav>
            <div className="task-docs-options lfp-options">
              {(listing?.folders ?? []).map((node) => (
                <button key={`f${node.id}`} type="button" className="lfp-folder" onClick={() => open(node)}>
                  <Folder size={16} />
                  <span className="task-docs-name">
                    <b title={node.name}>{node.name}</b>
                    <small>{node.children_count ? `${node.children_count} mục` : "Trống"}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              {files.map((file) => {
                const Icon = fileIcon(file.mime_type || "");
                const checked = selected.includes(file.id);
                const blocked = !checked && blockedReason?.(file);
                return (
                  <label key={file.id} className={`${checked ? "checked" : ""} ${blocked ? "blocked" : ""}`} title={blocked || undefined}>
                    <input type="checkbox" checked={checked} disabled={!!blocked} onChange={() => onToggle(file)} />
                    <span className="task-docs-check">{checked && <Check size={12} strokeWidth={3} />}</span>
                    <i className={`task-docs-icon ${fileTone(file.mime_type || "")}`}>
                      <Icon size={16} />
                    </i>
                    <span className="task-docs-name">
                      <b title={file.name}>{file.name}</b>
                      <small>
                        {fileKind(file.name, file.mime_type || "")} · {formatBytes(file.size)}
                        {query && file.path?.length > 0 && ` · ${file.path.map((crumb) => crumb.name).join(" / ")}`}
                      </small>
                    </span>
                  </label>
                );
              })}
              {loading && <p className="task-docs-none"><LoaderCircle size={15} className="spin" /> Đang tải...</p>}
              {!loading && error && <p className="task-docs-none">{error}</p>}
              {!loading && !error && listing && !files.length && !listing.folders.length && (
                <p className="task-docs-none">{query ? "Không tìm thấy file phù hợp." : "Thư mục này chưa có file."}</p>
              )}
              {!loading && more && (
                <button type="button" className="lfp-more" onClick={() => load(listing.meta.current_page + 1)}>Xem thêm file</button>
              )}
            </div>
          </section>
        </div>
        <footer>
          <span>
            Đã chọn <b>{selected.length}</b> file
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
