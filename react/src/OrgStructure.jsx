import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Building2, ChevronRight, FolderTree, Pencil, Plus, Power, Search, Trash2, Users, X } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { EMPLOYMENT_LABELS } from "./PersonnelDrawer";
import "./OrgStructure.css";
import UserAvatar from "./Avatar";
import TablePagination, { usePagination } from "./TablePagination";

const COLLAPSED_KEY = "org-collapsed";
const DESCRIPTION_MAX = 1000;

const collator = new Intl.Collator("vi", { numeric: true });
const givenName = (name) => (name ?? "").trim().split(/\s+/).at(-1);
const MEMBER_SORTERS = {
  name: (a, b) => collator.compare(givenName(a.name), givenName(b.name)) || collator.compare(a.name ?? "", b.name ?? ""),
  code: (a, b) => collator.compare(a.employee_code ?? "", b.employee_code ?? ""),
  status: (a, b) => collator.compare(EMPLOYMENT_LABELS[a.employment_status] ?? "", EMPLOYMENT_LABELS[b.employment_status] ?? ""),
};

export default function OrgStructure({ onChanged, onError }) {
  const [units, setUnits] = useState([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [picking, setPicking] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]")));
  const confirm = useConfirm();

  const loadUnits = async () => {
    try {
      const payload = await apiJson("/api/units");
      setUnits(payload.units);
      setCanConfigure(payload.can_configure);
      setSelectedId((current) => current ?? payload.units[0]?.id ?? null);
    } catch (e) {
      onError(e.message);
    }
  };

  const loadDetail = async (id) => {
    if (!id) return setDetail(null);
    try {
      setDetail(await apiJson(`/api/units/${id}`));
    } catch (e) {
      onError(e.message);
    }
  };

  useEffect(() => {
    loadUnits();
  }, []);
  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId]);

  const roots = units.filter((unit) => !unit.parent_id);
  const selected = units.find((unit) => unit.id === selectedId);
  const childrenOf = (id) => units.filter((unit) => unit.parent_id === id);

  const updateCollapsed = (next) => {
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
  };
  const toggle = (id) => {
    const next = new Set(collapsed);
    next.has(id) ? next.delete(id) : next.add(id);
    updateCollapsed(next);
  };
  const expand = (id) => {
    if (!collapsed.has(id)) return;
    const next = new Set(collapsed);
    next.delete(id);
    updateCollapsed(next);
  };
  const allCollapsed = roots.some((root) => childrenOf(root.id).length) && roots.every((root) => !childrenOf(root.id).length || collapsed.has(root.id));

  const refresh = async (message, nextId = selectedId) => {
    await loadUnits();
    setSelectedId(nextId);
    await loadDetail(nextId);
    onChanged(message);
  };

  const toggleActive = async () => {
    try {
      const payload = await apiJson(`/api/units/${selected.id}`, {
        method: "PUT",
        body: { name: selected.name, parent_id: selected.parent_id, is_active: !selected.is_active },
      });
      await refresh(payload.message);
    } catch (e) {
      onError(e.message);
    }
  };

  const removeLeader = async (slot, holder) => {
    const ok = await confirm({
      tone: "danger",
      title: `Gỡ ${slot.name.toLowerCase()} ${holder.name}?`,
      message: `${holder.name} vẫn là thành viên ${selected.name}, chỉ thôi giữ chức ${slot.name.toLowerCase()}.`,
      confirmText: "Gỡ",
    });
    if (!ok) return;
    try {
      const payload = await apiJson(`/api/units/${selected.id}/leaders`, { method: "DELETE", body: { role_code: slot.code, user_id: holder.user_id } });
      setDetail(payload.data);
      onChanged(payload.message);
    } catch (e) {
      onError(e.message);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      tone: "danger",
      title: `Xóa ${selected.parent_id ? "nhóm" : "tổ"} “${selected.name}”?`,
      message: "Chỉ xóa được đơn vị không còn nhóm con, thành viên, công việc hay chức vụ. Nếu đơn vị đã có dữ liệu, hãy dùng “Ngưng” thay vì xóa.",
      confirmText: "Xóa",
    });
    if (!ok) return;
    try {
      const payload = await apiJson(`/api/units/${selected.id}`, { method: "DELETE" });
      setSelectedId(null);
      await refresh(payload.message, null);
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <div className="org-layout">
      <section className="org-tree-card">
        <div className="org-tree-head">
          <div>
            <h3>Cơ cấu tổ chức</h3>
            <p>
              {roots.length} tổ · {units.length - roots.length} nhóm
              {units.length > roots.length && (
                <button type="button" className="org-link" onClick={() => updateCollapsed(allCollapsed ? new Set() : new Set(roots.map((root) => root.id)))}>
                  {allCollapsed ? "Mở rộng tất cả" : "Thu gọn tất cả"}
                </button>
              )}
            </p>
          </div>
          {canConfigure && (
            <button className="primary-btn" onClick={() => setEditing({ parent_id: null })}>
              <Plus size={15} /> Thêm tổ
            </button>
          )}
        </div>
        <div className="org-tree">
          {roots.map((root) => {
            const groups = childrenOf(root.id);
            const open = !collapsed.has(root.id);
            const hiddenSelected = !open && groups.some((group) => group.id === selectedId);
            return (
              <div key={root.id} className="org-branch" role="group">
                <div className={`org-row ${root.id === selectedId || hiddenSelected ? "active" : ""} ${root.is_active ? "" : "is-inactive"}`}>
                  {groups.length > 0 ? (
                    <button type="button" className={`org-toggle ${open ? "open" : ""}`} onClick={() => toggle(root.id)} aria-expanded={open} aria-label={open ? `Thu gọn ${root.name}` : `Mở rộng ${root.name}`}>
                      <ChevronRight size={15} />
                    </button>
                  ) : (
                    <span className="org-toggle-space" />
                  )}
                  <button type="button" className="org-select" onClick={() => setSelectedId(root.id)}>
                    <Building2 size={15} />
                    <span>{root.name}</span>
                    {groups.length > 0 && !open && <small>{groups.length} nhóm</small>}
                    <em>{root.members}</em>
                  </button>
                </div>
                {open &&
                  groups.map((group) => (
                    <div key={group.id} className={`org-row is-child ${group.id === selectedId ? "active" : ""} ${group.is_active ? "" : "is-inactive"}`}>
                      <button type="button" className="org-select" onClick={() => setSelectedId(group.id)}>
                        <Users size={15} />
                        <span>{group.name}</span>
                        <em>{group.members}</em>
                      </button>
                    </div>
                  ))}
              </div>
            );
          })}
          {!units.length && (
            <div className="org-empty">
              <FolderTree size={30} />
              <b>Chưa có tổ nào</b>
              <span>Thêm tổ đầu tiên để bắt đầu.</span>
            </div>
          )}
        </div>
      </section>

      <section className="org-detail-card">
        {selected && detail?.unit?.id === selected.id ? (
          <>
            <div className="org-detail-head">
              <div>
                <span className="org-type">{selected.parent_id ? "Nhóm" : "Tổ"}</span>
                <h3>{selected.label}</h3>
                <p>
                  {detail.members.length} thành viên
                  {!selected.is_active && " · Ngưng hoạt động"}
                </p>
                {detail.unit.description ? (
                  <p className="org-description">{detail.unit.description}</p>
                ) : (
                  canConfigure && (
                    <button type="button" className="org-link org-add-description" onClick={() => setEditing({ ...selected, description: "" })}>
                      <Plus size={13} /> Thêm mô tả
                    </button>
                  )
                )}
              </div>
              {canConfigure && (
                <div className="org-actions">
                  {!selected.parent_id && (
                    <button onClick={() => { expand(selected.id); setEditing({ parent_id: selected.id }); }}>
                      <Plus size={15} /> Thêm nhóm
                    </button>
                  )}
                  <button onClick={() => setEditing({ ...selected, description: detail.unit.description ?? "" })}>
                    <Pencil size={15} /> Sửa
                  </button>
                  <button onClick={toggleActive}>
                    <Power size={15} /> {selected.is_active ? "Ngưng" : "Kích hoạt"}
                  </button>
                  <button className="danger" onClick={remove}>
                    <Trash2 size={15} /> Xóa
                  </button>
                </div>
              )}
            </div>

            <div className="org-detail-body">
            <h4>Người phụ trách</h4>
            <LeaderSlots detail={detail} onPick={(slot, holder) => setPicking({ slot, replacing: holder })} onRemove={removeLeader} />

            <MemberList key={selected.id} members={detail.members} groups={childrenOf(selected.id)} />
            </div>
          </>
        ) : (
          <div className="org-empty">
            <FolderTree size={30} />
            <b>Chọn một tổ hoặc nhóm</b>
            <span>Xem người phụ trách và danh sách thành viên.</span>
          </div>
        )}
      </section>

      {picking && detail && (
        <LeaderPicker
          unit={{ ...detail.unit, slots: detail.slots }}
          slot={picking.slot}
          replacing={picking.replacing}
          holders={detail.leaders.filter((leader) => leader.role_code === picking.slot.code)}
          onClose={() => setPicking(null)}
          onDone={async (result) => {
            setPicking(null);
            setDetail(result.data);
            await loadUnits();
            onChanged(result.message);
          }}
        />
      )}

      {editing && (
        <UnitDialog
          unit={editing}
          roots={roots}
          onClose={() => setEditing(null)}
          onSaved={async (message, id) => {
            setEditing(null);
            await refresh(message, id ?? selectedId);
          }}
        />
      )}
    </div>
  );
}

function UnitDialog({ unit, roots, onClose, onSaved }) {
  const isGroup = unit.parent_id != null;
  const [name, setName] = useState(unit.name ?? "");
  const [parentId, setParentId] = useState(unit.parent_id ?? "");
  const [description, setDescription] = useState(unit.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const kind = isGroup ? "nhóm" : "tổ";
  const parent = roots.find((root) => root.id === Number(parentId));

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return setError(`Vui lòng nhập tên ${kind}.`);
    setSaving(true);
    setError("");
    const body = { name: name.trim(), parent_id: isGroup ? Number(parentId) : null, description: description.trim() };
    try {
      const payload = unit.id
        ? await apiJson(`/api/units/${unit.id}`, { method: "PUT", body: { ...body, is_active: unit.is_active } })
        : await apiJson("/api/units", { method: "POST", body });
      await onSaved(payload.message, unit.id ? null : payload.data?.id);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form className="org-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="org-dialog-title">
        <header>
          <span className="org-dialog-icon">{isGroup ? <Users size={18} /> : <Building2 size={18} />}</span>
          <div>
            <h3 id="org-dialog-title">{unit.id ? `Sửa ${kind}` : `Thêm ${kind}`}</h3>
            <p>
              {isGroup
                ? unit.id
                  ? "Đổi tên, mô tả hoặc chuyển nhóm sang tổ khác."
                  : `Nhóm chuyên môn thuộc ${parent ? `“${parent.name}”` : "một tổ"}.`
                : "Tổ là đơn vị cấp trên, có thể chia thành nhiều nhóm."}
            </p>
          </div>
          <button type="button" className="org-dialog-close" onClick={onClose} disabled={saving} aria-label="Đóng"><X size={18} /></button>
        </header>
        <label>
          Tên {kind}
          <input value={name} autoFocus={!unit.id || !!unit.description} maxLength={150} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder={isGroup ? "VD: Nhóm toán" : "VD: Tổ tự nhiên"} />
        </label>
        {isGroup && (
          <label>
            Thuộc tổ
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              {roots.map((root) => <option key={root.id} value={root.id}>{root.name}</option>)}
            </select>
          </label>
        )}
        <label>
          <span className="org-label-row">
            Mô tả <small>{description.length}/{DESCRIPTION_MAX}</small>
          </span>
          <textarea
            value={description}
            rows={4}
            maxLength={DESCRIPTION_MAX}
            autoFocus={!!unit.id && !unit.description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isGroup ? "VD: Gồm giáo viên Toán khối 6–9; phụ trách bồi dưỡng HSG Toán, ra đề kiểm tra định kỳ." : "VD: Gồm các nhóm Toán, Lý, Hóa, Sinh, Tin; phụ trách thí nghiệm, phòng bộ môn, thi KHKT."}
          />
          <small className="org-hint">Các môn, mảng việc hoặc nhiệm vụ tổ/nhóm phụ trách.</small>
        </label>
        {error && <p className="org-dialog-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>Hủy</button>
          <button className="primary-btn" disabled={saving || !name.trim()}>
            {saving ? "Đang lưu..." : unit.id ? "Lưu thay đổi" : `Thêm ${kind}`}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Avatar({ person, size = 30 }) {
  return person.avatar_url ? (
    <img className="org-avatar" src={person.avatar_url} alt="" style={{ width: size, height: size }} />
  ) : (
    <UserAvatar className="org-avatar" name={person.name} size={size} />
  );
}

function LeaderSlots({ detail, onPick, onRemove }) {
  return (
    <div className="org-slots">
      {detail.slots.map((slot) => {
        const holders = detail.leaders.filter((leader) => leader.role_code === slot.code);
        return (
          <div key={slot.code} className="org-slot">
            <span className="org-slot-label">{slot.name}</span>
            {holders.map((holder) => (
              <div key={holder.user_id} className="org-holder">
                <Avatar person={holder} />
                <span>
                  <b>{holder.name}</b>
                  <small>{holder.employee_code}</small>
                </span>
                {detail.can_assign && (
                  <>
                    <button type="button" title={`Đổi ${slot.name.toLowerCase()}`} onClick={() => onPick(slot, holder)}><ArrowLeftRight size={14} /></button>
                    <button type="button" className="danger" title={`Gỡ ${slot.name.toLowerCase()}`} onClick={() => onRemove(slot, holder)}><X size={14} /></button>
                  </>
                )}
              </div>
            ))}
            {!holders.length && !detail.can_assign && <em className="org-muted">Chưa có</em>}
            {detail.can_assign && (!slot.single || !holders.length) && (
              <button type="button" className="org-slot-add" onClick={() => onPick(slot, null)}>
                <Plus size={14} /> {holders.length ? `Thêm ${slot.name.toLowerCase()}` : `Gán ${slot.name.toLowerCase()}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MemberList({ members, groups }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(null);
  const [sort, setSort] = useState({ key: "name", desc: false });
  const keyword = query.trim().toLowerCase();
  const inGroup = (member, id) => (id === 0 ? !member.group_ids.length : member.group_ids.includes(id));
  const chips = groups.length
    ? [{ id: null, name: "Tất cả", count: members.length }, ...groups.map((g) => ({ id: g.id, name: g.name, count: members.filter((m) => inGroup(m, g.id)).length })), { id: 0, name: "Trực thuộc tổ", count: members.filter((m) => inGroup(m, 0)).length }].filter((chip) => chip.id === null || chip.count)
    : [];
  const rows = members
    .filter((member) => (group === null || inGroup(member, group)) && (!keyword || `${member.name} ${member.employee_code ?? ""}`.toLowerCase().includes(keyword)))
    .sort((a, b) => (sort.desc ? -1 : 1) * (MEMBER_SORTERS[sort.key](a, b) || MEMBER_SORTERS.name(a, b)));
  const pager = usePagination(rows, 10);
  const sortBy = (key) => {
    setSort((current) => ({ key, desc: current.key === key && !current.desc }));
    pager.reset();
  };
  const header = (key, label) => (
    <th className={`sortable ${sort.key === key ? "sorted" : ""}`} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"} onClick={() => sortBy(key)}>
      {label}
      {sort.key === key && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
    </th>
  );

  return (
    <>
      <div className="org-members-tools">
        <h4>Thành viên <em>{members.length}</em></h4>
        <label className="org-search">
          <Search size={14} />
          <input value={query} onChange={(e) => { setQuery(e.target.value); pager.reset(); }} placeholder="Tìm tên hoặc mã nhân sự..." />
        </label>
      </div>
      {chips.length > 0 && (
        <div className="org-group-chips">
          {chips.map((chip) => (
            <button key={String(chip.id)} type="button" className={group === chip.id ? "active" : ""} onClick={() => { setGroup(chip.id); pager.reset(); }}>
              {chip.name} <em>{chip.count}</em>
            </button>
          ))}
        </div>
      )}
      <div className="org-members">
        <table>
          <thead>
            <tr>
              {header("name", "Nhân sự")}
              {header("code", "Mã NS")}
              <th>Vai trò</th>
              {header("status", "Trạng thái")}
            </tr>
          </thead>
          <tbody>
            {pager.rows.map((member) => (
              <tr key={member.user_id}>
                <td>
                  <span className="org-person">
                    <Avatar person={member} />
                    <span>
                      <b>{member.name}</b>
                      {member.via && <small>qua {member.via}</small>}
                    </span>
                  </span>
                </td>
                <td><code>{member.employee_code}</code></td>
                <td>
                  <div className="chip-list">
                    {member.roles.map((role) => <span key={role}>{role}</span>)}
                  </div>
                </td>
                <td>{EMPLOYMENT_LABELS[member.employment_status] ?? member.employment_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!members.length && <p className="org-muted">Chưa có thành viên trong đơn vị này.</p>}
        {members.length > 0 && !rows.length && <p className="org-muted">Không có thành viên phù hợp.</p>}
      </div>
      {pager.total > 10 && <TablePagination pager={pager} noun="thành viên" />}
    </>
  );
}

function LeaderPicker({ unit, slot, replacing, holders, onClose, onDone }) {
  const [candidates, setCandidates] = useState(null);
  const [query, setQuery] = useState("");
  const [onlyMembers, setOnlyMembers] = useState(true);
  const [chosen, setChosen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson(`/api/units/${unit.id}/leader-candidates`).then((result) => setCandidates(result.data)).catch((e) => setError(e.message));
  }, [unit.id]);
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const keyword = query.trim().toLowerCase();
  const list = (candidates ?? []).filter(
    (person) => (!onlyMembers || person.in_unit) && (!keyword || `${person.name} ${person.employee_code ?? ""}`.toLowerCase().includes(keyword)),
  );
  const current = slot.single ? holders[0] : replacing;
  const otherRole = chosen?.unit_role && chosen.unit_role !== slot.code ? unit.slots.find((s) => s.code === chosen.unit_role)?.name : null;
  const kind = unit.parent_id ? "nhóm" : "tổ";

  const confirm = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await apiJson(`/api/units/${unit.id}/leaders`, {
        method: "PUT",
        body: { role_code: slot.code, user_id: chosen.user_id, replace_user_id: replacing?.user_id ?? null },
      });
      onDone(result);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="org-dialog org-picker" role="dialog" aria-modal="true" aria-labelledby="org-picker-title">
        <header>
          <span className="org-dialog-icon"><ArrowLeftRight size={18} /></span>
          <div>
            <h3 id="org-picker-title">{replacing ? `Đổi ${slot.name.toLowerCase()}` : `Chọn ${slot.name.toLowerCase()}`}</h3>
            <p>{unit.name}{current ? ` · hiện tại: ${current.name}` : ""}</p>
          </div>
          <button type="button" className="org-dialog-close" onClick={onClose} disabled={saving} aria-label="Đóng"><X size={18} /></button>
        </header>
        <div className="org-picker-tools">
          <label className="org-search">
            <Search size={14} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên hoặc mã nhân sự..." />
          </label>
          <label className="org-check">
            <input type="checkbox" checked={onlyMembers} onChange={(e) => setOnlyMembers(e.target.checked)} />
            Chỉ thành viên {kind}
          </label>
        </div>
        <div className="org-picker-list" role="listbox">
          {!candidates && !error && <p className="org-muted">Đang tải...</p>}
          {candidates && !list.length && <p className="org-muted">Không có giáo viên phù hợp.</p>}
          {list.map((person) => {
            const holds = person.unit_role === slot.code;
            return (
              <button
                key={person.user_id}
                type="button"
                role="option"
                aria-selected={chosen?.user_id === person.user_id}
                className={`org-candidate ${chosen?.user_id === person.user_id ? "chosen" : ""}`}
                disabled={holds}
                onClick={() => setChosen(person)}
              >
                <Avatar person={person} size={34} />
                <span className="org-candidate-main">
                  <b>{person.name} <code>{person.employee_code}</code></b>
                  <small>{person.units.join(", ") || "Chưa thuộc tổ/nhóm nào"}</small>
                </span>
                <span className="chip-list">
                  {holds ? <span className="current">Đang giữ</span> : person.roles.filter((role) => !["Giáo viên", "Nhân viên", "Giáo viên chủ nhiệm"].includes(role)).slice(0, 2).map((role) => <span key={role}>{role}</span>)}
                </span>
              </button>
            );
          })}
        </div>
        {chosen && (
          <div className="org-picker-summary">
            <p>
              {current && current.user_id !== chosen.user_id
                ? <>Thay <b>{current.name}</b> bằng <b>{chosen.name}</b> làm {slot.name} {unit.name}.</>
                : <>Giao <b>{slot.name} {unit.name}</b> cho <b>{chosen.name}</b>.</>}
            </p>
            {otherRole && <span className="warn">{chosen.name} đang là {otherRole} của {kind} này và sẽ chuyển sang {slot.name}.</span>}
            {!chosen.in_unit && <span>{chosen.name} sẽ được thêm vào {unit.name}.</span>}
          </div>
        )}
        {error && <p className="org-dialog-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>Hủy</button>
          <button type="button" className="primary-btn" disabled={!chosen || saving} onClick={confirm}>{saving ? "Đang lưu..." : "Xác nhận"}</button>
        </footer>
      </div>
    </div>
  );
}
