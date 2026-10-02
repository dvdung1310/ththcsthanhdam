import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardPaste, Copy, ExternalLink, Eye, FileText, Folder, FolderOpen, FolderPlus, Home, Link2, Paperclip, Pencil, Plus, Scissors, Search, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react'
import './DocumentManagement.css'
import { apiFetch } from './api'
import { RichTextEditor } from './TaskManagement'

const emptyDocument = { title: '', link: '', summary: '' }

export default function DocumentManagement({ canManage }) {
  const [documents, setDocuments] = useState([])
  const [folders, setFolders] = useState([])
  const [currentFolder, setCurrentFolder] = useState(null)
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 10, total: 0 })
  const [search, setSearch] = useState('')
  const [fileType, setFileType] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [clipboard, setClipboard] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [folderDialog, setFolderDialog] = useState(null)
  const [aiSummary, setAiSummary] = useState(null)

  const loadDocuments = useCallback(async () => {
    setLoading(true); setError('')
    const params = new URLSearchParams({ page, per_page: perPage, folder_id: currentFolder ?? '' })
    if (search) params.set('search', search)
    if (fileType) params.set('file_type', fileType)
    params.set('sort', sort)
    try {
      const response = await apiFetch(`/api/documents?${params}`, { headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('Không thể tải danh sách văn bản.')
      const payload = await response.json()
      setDocuments(payload.data); setMeta(payload.meta); setFolders(payload.folders ?? [])
    } catch (caught) { setError(caught.message) } finally { setLoading(false) }
  }, [page, perPage, search, fileType, sort, currentFolder])

  useEffect(() => { const timer = setTimeout(loadDocuments, 250); return () => clearTimeout(timer) }, [loadDocuments])
  useEffect(() => { if (!success) return undefined; const timer = setTimeout(() => setSuccess(''), 3500); return () => clearTimeout(timer) }, [success])
  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close); window.addEventListener('blur', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close) }
  }, [])

  const saveDocument = async (event) => {
    event.preventDefault(); setSaving(true); setError('')
    const formData = new FormData(event.currentTarget)
    formData.set('summary', editing.summary ?? '')
    if (editing.id) formData.append('_method', 'PUT')
    try {
      const response = await apiFetch(editing.id ? `/api/documents/${editing.id}` : '/api/documents', { method: 'POST', headers: { Accept: 'application/json' }, body: formData })
      const payload = await response.json()
      if (!response.ok) throw new Error(Object.values(payload.errors ?? {}).flat()[0] ?? payload.message ?? 'Không thể lưu văn bản.')
      setEditing(null); setSuccess(payload.message); await loadDocuments()
    } catch (caught) { setError(caught.message) } finally { setSaving(false) }
  }

  const deleteDocument = async () => {
    try {
      const response = await apiFetch(`/api/documents/${deleting.id}`, { method: 'DELETE', headers: { Accept: 'application/json' } })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message ?? 'Không thể xóa văn bản.')
      setDeleting(null); setSuccess(payload.message); if (documents.length === 1 && page > 1) setPage(page - 1); else await loadDocuments()
    } catch (caught) { setDeleting(null); setError(caught.message) }
  }

  const viewDocumentFile = async (document) => {
    const viewer = window.open('', '_blank')
    try {
      const response = await apiFetch(document.download_url, { headers: { Accept: document.file_name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '*/*' } })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message ?? 'Không thể mở file văn bản.')
      }
      const blobUrl = URL.createObjectURL(await response.blob())
      if (viewer) viewer.location.replace(blobUrl)
      else window.open(blobUrl, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (caught) {
      viewer?.close()
      setError(caught.message)
    }
  }

  const createFolder = () => setFolderDialog({ mode: 'create', name: '', parentId: currentFolder })

  const submitFolderDialog = async (event) => {
    event.preventDefault()
    const name = new FormData(event.currentTarget).get('name')?.trim()
    if (!name) return
    const creating = folderDialog.mode === 'create'
    const response = await apiFetch(creating ? '/api/document-folders' : `/api/document-folders/${folderDialog.folderId}`, { method: creating ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(creating ? { name, parent_id: folderDialog.parentId } : { name }) })
    const payload = await response.json()
    if (!response.ok) return setFolderDialog((current) => ({ ...current, error: Object.values(payload.errors ?? {}).flat()[0] ?? payload.message }))
    setFolderDialog(null); setSuccess(payload.message); await loadDocuments()
  }

  const renameFolder = (folderId = currentFolder) => {
    const folder = folders.find((item) => item.id === folderId)
    if (!folder) return
    setFolderDialog({ mode: 'rename', folderId: folder.id, name: folder.name })
  }

  const deleteFolder = (folderId = currentFolder) => {
    const folder = folders.find((item) => item.id === folderId)
    if (!folder) return
    setFolderDialog({ mode: 'delete', folderId: folder.id, name: folder.name })
  }

  const confirmDeleteFolder = async () => {
    const response = await apiFetch(`/api/document-folders/${folderDialog.folderId}`, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const payload = await response.json()
    if (!response.ok) return setError(payload.message)
    const folder = folders.find((item) => item.id === folderDialog.folderId)
    if (currentFolder === folderDialog.folderId) setCurrentFolder(folder?.parent_id ?? null)
    setFolderDialog(null); setSelected(null); setSuccess(payload.message); await loadDocuments()
  }

  const copyOrCut = (action, item = selected) => {
    if (!item) return
    setClipboard({ ...item, action }); setContextMenu(null)
    setSuccess(action === 'cut' ? 'Đã cắt mục. Hãy chọn thư mục đích và dán.' : 'Đã sao chép mục. Hãy chọn thư mục đích và dán.')
  }

  const pasteItem = async () => {
    if (!clipboard) return
    const response = await apiFetch('/api/data-library/paste', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ item_type: clipboard.type, item_id: clipboard.id, action: clipboard.action, target_folder_id: currentFolder }) })
    const payload = await response.json()
    if (!response.ok) return setError(Object.values(payload.errors ?? {}).flat()[0] ?? payload.message)
    if (clipboard.action === 'cut') setClipboard(null)
    setSelected(null); setContextMenu(null); setSuccess(payload.message); await loadDocuments()
  }

  const renameItem = (item = selected) => {
    if (!item) return
    setContextMenu(null)
    if (item.type === 'file') setEditing({ ...documents.find((document) => document.id === item.id) })
    else renameFolder(item.id)
  }

  const deleteItem = (item = selected) => {
    if (!item) return
    setContextMenu(null)
    if (item.type === 'file') setDeleting(documents.find((document) => document.id === item.id))
    else deleteFolder(item.id)
  }

  useEffect(() => {
    const shortcut = (event) => {
      if (!canManage || editing || viewing || deleting || folderDialog || aiSummary || window.getSelection()?.toString() || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return
      if (event.ctrlKey && event.key.toLowerCase() === 'c' && selected) { event.preventDefault(); copyOrCut('copy') }
      if (event.ctrlKey && event.key.toLowerCase() === 'x' && selected) { event.preventDefault(); copyOrCut('cut') }
      if (event.ctrlKey && event.key.toLowerCase() === 'v' && clipboard) { event.preventDefault(); pasteItem() }
      if (event.key === 'Delete' && selected) { event.preventDefault(); deleteItem() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })

  const openContextMenu = (event, item = null) => {
    if (!canManage) return
    event.preventDefault(); event.stopPropagation()
    if (item) setSelected(item)
    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 280), item })
  }

  const summarizeWithAi = async (document) => {
    setContextMenu(null); setAiSummary({ document, loading: true, text: '', error: '' })
    try {
      const response = await apiFetch(`/api/documents/${document.id}/ai-summary`, { method: 'POST', headers: { Accept: 'application/json' } })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message ?? 'AI chưa thể tóm tắt tài liệu.')
      setAiSummary({ document, loading: false, text: payload.summary, html: summaryToHtml(payload.summary), error: '' })
    } catch (caught) {
      setAiSummary({ document, loading: false, text: '', error: caught.message })
    }
  }

  const saveAiSummary = async () => {
    const formData = new FormData()
    formData.set('_method', 'PUT'); formData.set('title', aiSummary.document.title)
    formData.set('link', aiSummary.document.link ?? ''); formData.set('folder_id', aiSummary.document.folder_id ?? '')
    formData.set('summary', aiSummary.html)
    const response = await apiFetch(`/api/documents/${aiSummary.document.id}`, { method: 'POST', headers: { Accept: 'application/json' }, body: formData })
    const payload = await response.json()
    if (!response.ok) return setAiSummary((current) => ({ ...current, error: Object.values(payload.errors ?? {}).flat()[0] ?? payload.message }))
    setAiSummary(null); setSuccess('Đã lưu tóm tắt do AI tạo.'); await loadDocuments()
  }

  const childFolders = folders.filter((folder) => folder.parent_id === currentFolder)
  const breadcrumbs = []
  let breadcrumbId = currentFolder
  while (breadcrumbId) {
    const folder = folders.find((item) => item.id === breadcrumbId)
    if (!folder) break
    breadcrumbs.unshift(folder); breadcrumbId = folder.parent_id
  }

  return <div className={`document-page data-library ${canManage ? '' : 'read-only'}`}>
    {success && <div className="success-toast" role="status"><span><CheckCircle2 size={20} /></span><div><b>Thành công</b><small>{success}</small></div><button onClick={() => setSuccess('')}><X size={17} /></button></div>}
    <div className="explorer-shell">
      <aside className="folder-sidebar" onContextMenu={(event) => openContextMenu(event)}><div className="folder-sidebar-title"><FolderOpen size={19}/><b>Thư mục</b></div><button className={currentFolder === null ? 'active' : ''} onClick={() => { setCurrentFolder(null); setSelected(null); setPage(1) }} onContextMenu={(event) => { setCurrentFolder(null); openContextMenu(event) }}><Home size={16}/><span>Dữ liệu dùng chung</span><small>{folders.filter((folder) => folder.parent_id === null).length} thư mục</small></button><FolderTree folders={folders} current={currentFolder} onSelect={(id) => { setCurrentFolder(id); setSelected({ type: 'folder', id }); setPage(1) }} onContextMenu={openContextMenu} /></aside>
      <div className="explorer-main">
    <section className="document-toolbar compact explorer-toolbar">
      <div className="explorer-address"><div className="breadcrumbs"><button onClick={() => setCurrentFolder(null)}><Home size={15}/>Dữ liệu dùng chung</button>{breadcrumbs.map((folder) => <span key={folder.id}><ChevronRight size={14}/><button onClick={() => setCurrentFolder(folder.id)}>{folder.name}</button></span>)}</div></div>
      <div className="smart-filters"><label className="doc-search simple"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Tìm tiêu đề, nội dung hoặc liên kết..." /></label><select value={fileType} onChange={(event) => { setFileType(event.target.value); setPage(1) }}><option value="">Tất cả dữ liệu</option><option value="pdf">Tệp PDF</option><option value="word">Tệp Word</option><option value="excel">Tệp Excel</option><option value="image">Hình ảnh</option><option value="link">Có liên kết</option><option value="none">Chưa có file/link</option></select><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}><option value="newest">Mới tạo gần đây</option><option value="oldest">Cũ nhất trước</option><option value="name_asc">Tên A → Z</option><option value="name_desc">Tên Z → A</option></select><div className="explorer-actions">{canManage && <><button className="secondary-btn" onClick={createFolder}><FolderPlus size={17} /> Thư mục mới</button><button className="primary-btn" onClick={() => setEditing({ ...emptyDocument, folder_id: currentFolder })}><Plus size={17} /> Tải tài liệu</button></>}</div></div>
    </section>
    <section className="document-table-card explorer-content" onClick={() => setSelected(null)} onContextMenu={(event) => openContextMenu(event)}>
      {error && <div className="api-error"><TriangleAlert size={16} />{error}<button onClick={loadDocuments}>Thử lại</button></div>}
      {!!childFolders.length && <div className="folder-grid">{childFolders.map((folder) => <button className={selected?.type === 'folder' && selected.id === folder.id ? 'selected' : ''} key={folder.id} onDoubleClick={() => { setCurrentFolder(folder.id); setSelected(null) }} onClick={(event) => { event.stopPropagation(); setSelected({ type: 'folder', id: folder.id }) }} onContextMenu={(event) => openContextMenu(event, { type: 'folder', id: folder.id })}><Folder size={34}/><span><b>{folder.name}</b><small>{folder.children_count} thư mục · {folder.documents_count} tệp</small></span><ChevronRight size={16}/></button>)}</div>}
      <div className="document-table-wrap"><table className="simple-document-table"><thead><tr><th>Tiêu đề</th><th>File</th><th>Link</th><th>Tóm tắt</th><th>Thời gian tạo</th><th>Thao tác</th></tr></thead>
        <tbody>{documents.map((document) => <tr className={selected?.type === 'file' && selected.id === document.id ? 'selected' : ''} key={document.id} onClick={(event) => { event.stopPropagation(); setSelected({ type: 'file', id: document.id }) }} onDoubleClick={(event) => { event.stopPropagation(); document.download_url ? viewDocumentFile(document) : setViewing(document) }} onContextMenu={(event) => openContextMenu(event, { type: 'file', id: document.id })}><td className="document-title-cell"><b>{document.title}</b></td><td>{document.download_url ? <button type="button" className="file-link file-view-button" onClick={(event) => { event.stopPropagation(); viewDocumentFile(document) }}><Paperclip size={14} />{document.file_name}</button> : <span className="no-file">Không có</span>}</td><td>{document.link ? <a className="file-link" href={document.link} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><Link2 size={14} />Mở link</a> : <span className="no-file">Không có</span>}</td><td className="document-summary-preview"><div className="summary-clamp" dangerouslySetInnerHTML={{ __html: document.summary || '<span>Chưa có tóm tắt</span>' }} /></td><td className="document-created-at"><b>{document.created_at ? new Date(document.created_at).toLocaleDateString('vi-VN') : '—'}</b><small>{document.created_at ? new Date(document.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}</small></td><td className="document-actions-cell"><div className="row-actions"><button title="Xem" onClick={(event) => { event.stopPropagation(); setViewing(document) }}><Eye size={15} /></button>{canManage && <>{document.download_url && <button className="ai-action" title="AI tóm tắt" onClick={(event) => { event.stopPropagation(); summarizeWithAi(document) }}><Sparkles size={15}/></button>}<button title="Sửa" onClick={(event) => { event.stopPropagation(); setEditing({ ...document }) }}><Pencil size={15} /></button><button className="delete" title="Xóa" onClick={(event) => { event.stopPropagation(); setDeleting(document) }}><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody>
      </table>{loading ? <div className="empty-state"><FileText className="loading-icon" size={36} /><b>Đang tải văn bản...</b></div> : !documents.length && <div className="empty-state"><FileText size={36} /><b>Không tìm thấy văn bản</b></div>}</div>
      <div className="pagination"><span>Hiển thị <b>{meta.total ? (meta.current_page - 1) * meta.per_page + 1 : 0}–{Math.min(meta.current_page * meta.per_page, meta.total)}</b> trong {meta.total} kết quả</span><div><label>Số dòng <select value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1) }}><option>5</option><option>10</option><option>20</option></select></label><button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>{Array.from({ length: meta.last_page }, (_, index) => <button key={index} className={page === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === meta.last_page} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button></div></div>
    </section>
      </div>
    </div>
    {contextMenu && <div className="explorer-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>{contextMenu.item ? <><button onClick={() => { contextMenu.item.type === 'folder' ? setCurrentFolder(contextMenu.item.id) : setViewing(documents.find((item) => item.id === contextMenu.item.id)); setContextMenu(null) }}><Eye size={16}/>Mở</button>{contextMenu.item.type === 'file' && documents.find((item) => item.id === contextMenu.item.id)?.download_url && <button className="ai-menu-item" onClick={() => summarizeWithAi(documents.find((item) => item.id === contextMenu.item.id))}><Sparkles size={16}/>AI tóm tắt</button>}<hr/><button onClick={() => copyOrCut('cut', contextMenu.item)}><Scissors size={16}/>Cắt <kbd>Ctrl+X</kbd></button><button onClick={() => copyOrCut('copy', contextMenu.item)}><Copy size={16}/>Sao chép <kbd>Ctrl+C</kbd></button><hr/><button onClick={() => renameItem(contextMenu.item)}><Pencil size={16}/>Đổi tên</button><button className="danger" onClick={() => deleteItem(contextMenu.item)}><Trash2 size={16}/>Xóa <kbd>Del</kbd></button></> : <><button disabled={!clipboard} onClick={pasteItem}><ClipboardPaste size={16}/>Dán <kbd>Ctrl+V</kbd></button><hr/><button onClick={() => { setContextMenu(null); createFolder() }}><FolderPlus size={16}/>Thư mục mới</button><button onClick={() => { setContextMenu(null); setEditing({ ...emptyDocument, folder_id: currentFolder }) }}><Plus size={16}/>Tải tài liệu</button></>}</div>}
    {aiSummary && <div className="modal-backdrop"><div className="ai-summary-dialog"><div className="modal-head"><div><h3><Sparkles size={19}/> AI tóm tắt tài liệu</h3><p>{aiSummary.document.title}</p></div><button onClick={() => setAiSummary(null)}><X size={20}/></button></div><div className="ai-summary-body">{aiSummary.loading ? <div className="ai-summary-loading"><Sparkles size={30}/><b>AI đang đọc và phân tích file...</b><span>Quá trình có thể mất khoảng một phút.</span></div> : aiSummary.error ? <div className="api-error"><TriangleAlert size={17}/>{aiSummary.error}</div> : <div className="ai-summary-editor"><b className="editor-label">Nội dung tóm tắt — có thể chỉnh sửa trước khi lưu</b><RichTextEditor value={aiSummary.html} onChange={(html) => setAiSummary((current) => ({ ...current, html }))} placeholder="Nội dung AI tóm tắt..." /></div>}</div>{!aiSummary.loading && aiSummary.html && <div className="modal-actions"><button className="secondary-btn" onClick={() => setAiSummary(null)}>Đóng</button><button className="primary-btn" onClick={saveAiSummary}><Sparkles size={16}/>Lưu tóm tắt</button></div>}</div></div>}
    {folderDialog && <div className="modal-backdrop"><div className="folder-dialog"><div className="folder-dialog-icon">{folderDialog.mode === 'delete' ? <Trash2 size={25}/> : <FolderPlus size={25}/>}</div><h3>{folderDialog.mode === 'create' ? 'Tạo thư mục mới' : folderDialog.mode === 'rename' ? 'Đổi tên thư mục' : 'Xóa thư mục?'}</h3>{folderDialog.mode === 'delete' ? <><p>Bạn có chắc muốn xóa thư mục <b>{folderDialog.name}</b>? Chỉ thư mục trống mới có thể xóa.</p><div className="folder-dialog-actions"><button className="secondary-btn" onClick={() => setFolderDialog(null)}>Hủy bỏ</button><button className="danger-btn" onClick={confirmDeleteFolder}>Xóa thư mục</button></div></> : <form onSubmit={submitFolderDialog}><label>Tên thư mục<input name="name" autoFocus required maxLength="150" defaultValue={folderDialog.name} onChange={() => folderDialog.error && setFolderDialog((current) => ({ ...current, error: '' }))} placeholder="Nhập tên thư mục" /></label>{folderDialog.error && <div className="folder-dialog-error"><TriangleAlert size={15}/>{folderDialog.error}</div>}<div className="folder-dialog-actions"><button type="button" className="secondary-btn" onClick={() => setFolderDialog(null)}>Hủy bỏ</button><button className="primary-btn">{folderDialog.mode === 'create' ? 'Tạo thư mục' : 'Lưu thay đổi'}</button></div></form>}</div></div>}
    {editing && <div className="modal-backdrop"><div className="document-modal"><div className="modal-head"><div><h3>{editing.id ? 'Cập nhật văn bản' : 'Thêm văn bản mới'}</h3><p>Chỉ nhập các thông tin cần thiết.</p></div><button onClick={() => setEditing(null)}><X size={20} /></button></div><form onSubmit={saveDocument}><div className="document-form-grid simple-form">
      <label className="wide">Tiêu đề<input name="title" required defaultValue={editing.title} placeholder="Nhập tiêu đề văn bản" /></label>
      <label className="wide file-upload"><Paperclip size={18} /><span><b>{editing.file_name ? 'Thay file đính kèm' : 'Chọn file đính kèm'}</b><small>PDF, Word, Excel hoặc ảnh — tối đa 20MB</small></span><input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" /></label>
      <label className="wide">Link (nếu có)<input name="link" type="url" defaultValue={editing.link ?? ''} placeholder="https://..." /></label>
      <input name="folder_id" type="hidden" value={editing.folder_id ?? ''} readOnly />
      <div className="wide document-editor"><b className="editor-label">Tóm tắt</b><RichTextEditor value={editing.summary ?? ''} onChange={(summary) => setEditing((current) => ({ ...current, summary }))} placeholder="Nhập nội dung tóm tắt..." /></div>
    </div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setEditing(null)}>Hủy bỏ</button><button className="primary-btn" disabled={saving}>{saving ? 'Đang lưu...' : editing.id ? 'Lưu thay đổi' : 'Thêm văn bản'}</button></div></form></div></div>}
    {viewing && <div className="modal-backdrop"><div className="document-detail"><div className="modal-head"><div><h3>Chi tiết văn bản</h3></div><button onClick={() => setViewing(null)}><X size={20} /></button></div><div className="detail-body"><h2>{viewing.title}</h2><div className="document-summary"><b>Nội dung tóm tắt</b><div dangerouslySetInnerHTML={{ __html: viewing.summary || '<p>Chưa có nội dung tóm tắt.</p>' }} /></div><div className="document-detail-actions">{viewing.download_url && <button type="button" className="download-btn file-view-button" onClick={() => viewDocumentFile(viewing)}><Eye size={16} /> Xem {viewing.file_name}</button>}{viewing.link && <a className="download-btn secondary-link" href={viewing.link} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mở liên kết</a>}</div></div></div></div>}
    {deleting && <div className="modal-backdrop"><div className="confirm-modal"><span><Trash2 size={24} /></span><h3>Xóa văn bản?</h3><p>Bạn có chắc muốn xóa <b>{deleting.title}</b>?</p><div><button className="secondary-btn" onClick={() => setDeleting(null)}>Hủy bỏ</button><button className="danger-btn" onClick={deleteDocument}>Xóa văn bản</button></div></div></div>}
  </div>
}

function FolderTree({ folders, current, onSelect, onContextMenu }) {
  return folders.filter((folder) => folder.parent_id === null).map((folder) => <div className="folder-tree-node" key={folder.id}><button className={current === folder.id ? 'active' : ''} title={`${folder.name} — ${folder.documents_count} tệp, ${folder.children_count} thư mục con`} onClick={(event) => { event.stopPropagation(); onSelect(folder.id) }} onContextMenu={(event) => onContextMenu(event, { type: 'folder', id: folder.id })}><Folder size={17}/><span>{folder.name}</span><small>{folder.documents_count} tệp · {folder.children_count} thư mục</small></button></div>)
}

function summaryToHtml(text) {
  const escape = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character])
  const inline = (value) => escape(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  const lines = text.split(/\r?\n/)
  let html = ''
  let inList = false
  lines.forEach((line) => {
    const trimmed = line.trim()
    const listItem = trimmed.match(/^[-•*]\s+(.+)/)
    if (listItem) {
      if (!inList) { html += '<ul>'; inList = true }
      html += `<li>${inline(listItem[1])}</li>`
      return
    }
    if (inList) { html += '</ul>'; inList = false }
    if (!trimmed) return
    const isHeading = /^\*\*.+\*\*:?$/.test(trimmed) || /^(Mục đích|Các ý chính|Mốc thời gian|Việc cần thực hiện|Lưu ý về tài liệu)/i.test(trimmed)
    html += isHeading ? `<p><strong>${inline(trimmed.replace(/^\*\*|\*\*:?$/g, ''))}</strong></p>` : `<p>${inline(trimmed)}</p>`
  })
  if (inList) html += '</ul>'
  return html
}
