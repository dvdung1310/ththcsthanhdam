import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, Layers3, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react'
import { apiFetch } from './api'
import './TaskConfiguration.css'
import './TaskConfigurationOverrides.css'
import './LatePenaltyConfiguration.css'

const emptyGroup = { code: '', name: '', task_nature: '', product_characteristics: '', maximum_score: 100 }
const emptyItem = { scope: 'school', name: '', product_type: 'Văn bản', task_group_id: '', score: 0, conversion_factor: 1, publication_status: 'draft', department_id: '', user_ids: [] }
const statusLabels = { draft: 'Bản nháp', published: 'Đã phát hành', inactive: 'Ngừng áp dụng' }

const emptyLateRule = { from_day: 1, to_day: '', penalty_percent: 5 }

export default function TaskConfiguration({ canManage, initialTab = 'groups' }) {
  const [tab, setTab] = useState(initialTab)
  const [data, setData] = useState({ groups: [], catalog_items: [], departments: [], users: [], late_penalty_rules: [] })
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [editingLateRule, setEditingLateRule] = useState(null)
  const [catalogScope, setCatalogScope] = useState('school')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { setTab(initialTab) }, [initialTab])
  const load = async () => {
    const response = await apiFetch('/api/task-configuration', { headers: { Accept: 'application/json' } })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.message || 'Không thể tải cấu hình giao việc.')
    setData(payload)
  }
  useEffect(() => { load().catch((e) => setError(e.message)) }, [])

  const submit = async (event, type) => {
    event.preventDefault(); setError('')
    const editing = type === 'group' ? editingGroup : type === 'item' ? editingItem : editingLateRule
    const body = Object.fromEntries(new FormData(event.currentTarget))
    if (type === 'item') body.user_ids = editingItem.user_ids || editingItem.users?.map((user) => user.id) || []
    if (type === 'late') body.to_day = body.to_day || null
    const base = type === 'group' ? 'task-groups' : type === 'item' ? 'task-catalog-items' : 'late-penalty-rules'
    try {
      const response = await apiFetch(`/api/${base}${editing.id ? `/${editing.id}` : ''}`, { method: editing.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json()
      if (!response.ok) throw new Error(Object.values(payload.errors || {}).flat()[0] || payload.message)
      type === 'group' ? setEditingGroup(null) : type === 'item' ? setEditingItem(null) : setEditingLateRule(null)
      setMessage(payload.message); await load()
    } catch (e) { setError(e.message) }
  }

  const remove = async (type, id) => {
    if (!window.confirm('Bạn có chắc muốn xóa mục này?')) return
    const response = await apiFetch(`/api/${type === 'group' ? 'task-groups' : type === 'item' ? 'task-catalog-items' : 'late-penalty-rules'}/${id}`, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const payload = await response.json(); if (!response.ok) return setError(payload.message)
    setMessage(payload.message); await load()
  }
  const scopedItems = data.catalog_items.filter((item) => item.scope === catalogScope)

  return <div className="task-config-page">
    {message && <div className="config-toast"><CheckCircle2 size={18} />{message}<button onClick={() => setMessage('')}><X size={15} /></button></div>}
    {error && <div className="config-error">{error}<button onClick={() => setError('')}><X size={15} /></button></div>}
    {editingLateRule && <Modal title={editingLateRule.id ? 'Cập nhật mức trừ điểm' : 'Thêm mức trừ điểm'} close={() => setEditingLateRule(null)}><form onSubmit={(e) => submit(e, 'late')}><div className="config-form"><label>Từ ngày trễ thứ<input name="from_day" type="number" min="1" step="1" required defaultValue={editingLateRule.from_day} /></label><label>Đến ngày trễ thứ<input name="to_day" type="number" min={editingLateRule.from_day || 1} step="1" defaultValue={editingLateRule.to_day || ''} placeholder="Để trống nếu không giới hạn" /></label><label className="wide">Tỷ lệ trừ (%)<input name="penalty_percent" type="number" min="0" max="100" step="0.01" required defaultValue={editingLateRule.penalty_percent} /></label></div><p className="config-form-note">Ví dụ: từ ngày 2 đến ngày 3, tỷ lệ 10% nghĩa là bài nộp trễ 2–3 ngày sẽ bị trừ 10% số điểm được chấm.</p><FormActions cancel={() => setEditingLateRule(null)} /></form></Modal>}
    <div className="config-tabs">
      <button className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}><Layers3 size={17} />Phân nhóm nhiệm vụ</button>
      <button className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}><ListChecks size={17} />Danh mục nhiệm vụ</button>
      <button className={tab === 'late-penalty' ? 'active' : ''} onClick={() => setTab('late-penalty')}><Clock3 size={17} />Trừ điểm trễ hạn</button>
    </div>

    {tab === 'late-penalty' && <section className="config-card">
      <div className="config-heading"><div><h2>Cấu hình trừ điểm hoàn thành muộn</h2><p>Điểm bị trừ được tính trên điểm người duyệt chấm. Một phần ngày trễ được làm tròn thành một ngày.</p></div>{canManage && <button className="primary-btn" onClick={() => setEditingLateRule({ ...emptyLateRule })}><Plus size={16} />Thêm mức trừ</button>}</div>
      <div className="table-wrap"><table><thead><tr><th>Thời gian trễ</th><th>Tỷ lệ trừ</th><th>Ví dụ với 100 điểm</th><th>Thao tác</th></tr></thead><tbody>
        {data.late_penalty_rules.map((rule) => <tr key={rule.id}><td><b>{rule.from_day === 1 && rule.to_day === 1 ? 'Trễ đến 1 ngày (từ 1 giây)' : rule.to_day ? (rule.from_day === rule.to_day ? `${rule.from_day} ngày` : `${rule.from_day}–${rule.to_day} ngày`) : `Từ ${rule.from_day} ngày`}</b></td><td><span className="penalty-chip">-{Number(rule.penalty_percent)}%</span></td><td>Trừ {Number(rule.penalty_percent)} điểm, còn {100 - Number(rule.penalty_percent)} điểm</td><td><Actions enabled={canManage} onEdit={() => setEditingLateRule(rule)} onDelete={() => remove('late', rule.id)} /></td></tr>)}
        {!data.late_penalty_rules.length && <tr><td colSpan="4" className="empty-config">Chưa cấu hình mức trừ điểm.</td></tr>}
      </tbody></table></div>
    </section>}

    {tab === 'groups' && <section className="config-card">
      <div className="config-heading"><div><h2>Bảng phân nhóm nhiệm vụ</h2><p>Thiết lập tính chất, sản phẩm và giới hạn điểm của từng nhóm.</p></div>{canManage && <button className="primary-btn" onClick={() => setEditingGroup({ ...emptyGroup })}><Plus size={16} />Thêm nhóm</button>}</div>
      <div className="table-wrap"><table><thead><tr><th>Mã nhóm</th><th>Tên nhóm</th><th>Tính chất nhiệm vụ</th><th>Đặc điểm sản phẩm</th><th>Điểm tối đa</th><th>Thao tác</th></tr></thead><tbody>
        {data.groups.map((group) => <tr key={group.id}><td><b>{group.code}</b></td><td>{group.name}</td><td>{group.task_nature || '—'}</td><td>{group.product_characteristics || '—'}</td><td><span className="score-chip">{Number(group.maximum_score)}</span></td><td><Actions enabled={canManage} onEdit={() => setEditingGroup(group)} onDelete={() => remove('group', group.id)} /></td></tr>)}
      </tbody></table></div>
    </section>}

    {tab === 'catalog' && <section className="config-card">
      <div className="config-heading"><div><h2>Bảng danh mục nhiệm vụ</h2><p>Mỗi nhiệm vụ có điểm tối đa và hệ số quy đổi riêng.</p></div>{canManage && <button className="primary-btn" disabled={!data.groups.length} onClick={() => setEditingItem({ ...emptyItem, scope: catalogScope, task_group_id: data.groups[0]?.id || '' })}><Plus size={16} />Thêm nhiệm vụ</button>}</div>
      <div className="scope-switch"><button className={catalogScope === 'school' ? 'active' : ''} onClick={() => setCatalogScope('school')}>Danh mục chung của trường</button><button className={catalogScope === 'department' ? 'active' : ''} onClick={() => setCatalogScope('department')}>Danh mục chung của phòng ban, bộ môn</button></div>
      <div className="table-wrap"><table><thead><tr><th>Tên nhiệm vụ</th><th>Sản phẩm</th><th>Phân nhóm nhiệm vụ</th><th>Điểm</th><th>Hệ số quy đổi</th><th>Trạng thái phát hành</th>{catalogScope === 'department' && <><th>Phòng ban / Bộ môn</th><th>Người sử dụng</th></>}<th>Thao tác</th></tr></thead><tbody>
        {scopedItems.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.product_type}</td><td>{item.group?.code} — {item.group?.name} (tối đa {Number(item.group?.maximum_score)} điểm)</td><td>{Number(item.score)}</td><td><b>{Number(item.conversion_factor)}</b></td><td><span className={`publication ${item.publication_status}`}>{statusLabels[item.publication_status]}</span></td>{catalogScope === 'department' && <><td>{item.department?.name || '—'}</td><td><div className="user-chip-list">{item.users?.map((user) => <span className="user-chip" key={user.id}><i>{user.name.charAt(0)}</i>{user.name}</span>) || '—'}</div></td></>}<td><Actions enabled={canManage} onEdit={() => setEditingItem({ ...item, user_ids: item.users?.map((user) => user.id) || [] })} onDelete={() => remove('item', item.id)} /></td></tr>)}
      </tbody></table></div>
    </section>}

    {editingGroup && <Modal title={editingGroup.id ? 'Cập nhật phân nhóm' : 'Thêm phân nhóm nhiệm vụ'} close={() => setEditingGroup(null)}><form onSubmit={(e) => submit(e, 'group')}><div className="config-form"><label>Mã nhóm<input name="code" required defaultValue={editingGroup.code} placeholder="N1" /></label><label>Tên nhóm<input name="name" required defaultValue={editingGroup.name} /></label><label>Tính chất nhiệm vụ<input name="task_nature" defaultValue={editingGroup.task_nature} /></label><label>Điểm tối đa<input name="maximum_score" type="number" min="0" step="0.01" required defaultValue={editingGroup.maximum_score} /></label><label className="wide">Đặc điểm sản phẩm<textarea name="product_characteristics" defaultValue={editingGroup.product_characteristics} /></label></div><FormActions cancel={() => setEditingGroup(null)} /></form></Modal>}
    {editingItem && <Modal title={editingItem.id ? 'Cập nhật nhiệm vụ' : 'Thêm nhiệm vụ vào danh mục'} close={() => setEditingItem(null)}><form onSubmit={(e) => submit(e, 'item')}><div className="config-form"><label>Phạm vi<select name="scope" value={editingItem.scope} onChange={(e) => setEditingItem({ ...editingItem, scope: e.target.value, user_ids: [] })}><option value="school">Chung của trường</option><option value="department">Phòng ban / Bộ môn</option></select></label><label>Tên nhiệm vụ<input name="name" required defaultValue={editingItem.name} /></label><label>Sản phẩm<input name="product_type" required defaultValue={editingItem.product_type} placeholder="Ví dụ: Văn bản, lượt, đề án..." /></label><label>Phân nhóm<select name="task_group_id" required defaultValue={editingItem.task_group_id}>{data.groups.map((g) => <option key={g.id} value={g.id}>{g.code} — {g.name} (tối đa {Number(g.maximum_score)} điểm)</option>)}</select></label><label>Điểm tối đa<input name="score" type="number" min="0" step="0.01" required defaultValue={editingItem.score} /></label><label>Hệ số quy đổi<input name="conversion_factor" type="number" min="0" step="0.01" required defaultValue={editingItem.conversion_factor} /></label><label>Trạng thái phát hành<select name="publication_status" defaultValue={editingItem.publication_status}><option value="draft">Bản nháp</option><option value="published">Đã phát hành</option><option value="inactive">Ngừng áp dụng</option></select></label>{editingItem.scope === 'department' && <><label>Phòng ban / Bộ môn<select name="department_id" defaultValue={editingItem.department_id || ''}><option value="">Chọn đơn vị</option>{data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><UserSelector users={data.users} selected={editingItem.user_ids || []} onChange={(user_ids) => setEditingItem({ ...editingItem, user_ids })} /></>}</div><FormActions cancel={() => setEditingItem(null)} /></form></Modal>}
  </div>
}

function Actions({ enabled, onEdit, onDelete }) { return enabled ? <div className="config-actions"><button title="Sửa" onClick={onEdit}><Pencil size={15} /></button><button className="delete" title="Xóa" onClick={onDelete}><Trash2 size={15} /></button></div> : 'Chỉ xem' }
function Modal({ title, close, children }) { return <div className="modal-backdrop"><div className="config-modal"><div className="modal-head"><h3>{title}</h3><button onClick={close}><X size={20} /></button></div>{children}</div></div> }
function FormActions({ cancel }) { return <div className="modal-actions"><button type="button" className="secondary-btn" onClick={cancel}>Hủy</button><button className="primary-btn">Lưu cấu hình</button></div> }
function UserSelector({ users, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const selectedUsers = users.filter((user) => selected.includes(user.id))
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
  return <div className="user-selector wide"><b>Người sử dụng</b><div className="user-chip-list"><button type="button" className="add-user" onClick={() => setOpen(!open)}><Plus size={16} /> Thêm</button>{selectedUsers.map((user) => <button type="button" className="user-chip" key={user.id} onClick={() => toggle(user.id)} title="Bấm để bỏ chọn"><i>{user.name.charAt(0)}</i>{user.name}<X size={12} /></button>)}</div>{open && <div className="user-picker">{users.map((user) => <button type="button" className={selected.includes(user.id) ? 'selected' : ''} key={user.id} onClick={() => toggle(user.id)}><i>{user.name.charAt(0)}</i><span>{user.name}</span>{selected.includes(user.id) && <CheckCircle2 size={15} />}</button>)}</div>}</div>
}
