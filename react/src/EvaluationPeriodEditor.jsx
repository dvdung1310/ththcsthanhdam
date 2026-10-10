import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Building2, Check, ChevronRight, ListChecks, Lock, Search, ShieldCheck, TriangleAlert, UserX, Users } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { STATUS_TONES } from "./evaluationUtils";
import "./Evaluation.css";
import Avatar from "./Avatar";
import EvaluationScorerPicker from "./EvaluationScorerPicker";

const pad = (n) => String(n).padStart(2, "0");
const AUDIENCE_SHORT = { teacher: "GV", staff: "NV", leadership: "BGH" };
const SLOT_LABELS = { unit: "Tổ", board: "BGH" };
const columnOf = (row, slot) => (slot === "unit" ? (row.audience === "teacher" ? "unit" : null) : row.audience === "teacher" ? "leader" : "unit");

function nextOpenMonth(periods) {
  const now = new Date();
  for (let offset = 0; offset < 24; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    if (!periods.some((p) => p.year === date.getFullYear() && p.month === date.getMonth() + 1)) return date;
  }
  return now;
}

function TriCheckbox({ checked, indeterminate, disabled, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} onClick={(e) => e.stopPropagation()} aria-label={label} />;
}

export default function EvaluationPeriodEditor() {
  const { periodId } = useParams();
  const editing = Boolean(periodId);
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const confirm = useConfirm();
  const [roster, setRoster] = useState(null);
  const [form, setForm] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [scorers, setScorers] = useState(new Set());
  const [audience, setAudience] = useState("");
  const [sheetScorers, setSheetScorers] = useState({});
  const [assigning, setAssigning] = useState(null);
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [show, setShow] = useState("all");
  const [collapsed, setCollapsed] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const result = await apiJson(`/api/evaluation-periods/roster${editing ? `?period_id=${periodId}` : ""}`);
        setRoster(result);
        setSelected(new Set(result.data.filter((row) => (editing ? row.evaluation : row.eligible)).map((row) => row.teacher_id)));
        setScorers(new Set(editing ? result.scorer_ids : result.scorer_candidates.filter((candidate) => candidate.suggested).map((candidate) => candidate.id)));
        setSheetScorers(Object.fromEntries(result.data.filter((row) => row.evaluation).map((row) => [row.teacher_id, { unit: row.evaluation.scorer_ids ?? [], leader: row.evaluation.leader_scorer_ids ?? [] }])));
        if (editing) {
          setForm({ self_due_on: result.period.self_due_on ?? "", unit_due_on: result.period.unit_due_on ?? "" });
        } else {
          const periods = (await apiJson("/api/evaluation-periods")).data;
          const wanted = Number(query.get("year")) && Number(query.get("month")) ? new Date(Number(query.get("year")), Number(query.get("month")) - 1, 1) : null;
          const taken = wanted && periods.some((p) => p.year === wanted.getFullYear() && p.month === wanted.getMonth() + 1);
          const next = wanted && !taken ? wanted : nextOpenMonth(periods);
          const prefix = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
          setForm({ year: next.getFullYear(), month: next.getMonth() + 1, self_due_on: `${prefix}-25`, unit_due_on: `${prefix}-28` });
        }
      } catch (e) {
        setError(e.message);
      }
    };
    load();
  }, [editing, periodId]);

  const rows = roster?.data ?? [];
  const units = roster?.units ?? [];
  const locked = roster?.period?.status === "published";
  const selectable = (row) => !locked && (row.evaluation ? row.removable : row.eligible);
  const members = rows.filter((row) => row.eligible || row.evaluation);
  const excluded = rows.filter((row) => !row.eligible && !row.evaluation);
  const added = rows.filter((row) => !row.evaluation && selected.has(row.teacher_id));
  const removed = rows.filter((row) => row.evaluation && !selected.has(row.teacher_id));
  const unitName = (id) => units.find((unit) => unit.id === id)?.name;

  const tree = useMemo(() => {
    const known = new Set(units.map((unit) => unit.id));
    const build = (unit, depth) => {
      const children = units.filter((child) => child.parent_id === unit.id).map((child) => build(child, depth + 1));
      const own = members.filter((row) => row.unit_id === unit.id);
      const all = [...own, ...children.flatMap((child) => child.all)];
      return { key: `u${unit.id}`, name: unit.name, type: unit.type, depth, all, children: children.filter((child) => child.all.length) };
    };
    const roots = units.filter((unit) => !unit.parent_id || !known.has(unit.parent_id)).map((unit) => build(unit, 0)).filter((node) => node.all.length);
    const orphans = members.filter((row) => !row.unit_id || !known.has(row.unit_id));
    if (orphans.length) roots.push({ key: "orphans", name: "Chưa thuộc tổ nào", depth: 0, all: orphans, children: [] });
    return roots;
  }, [units, members]);

  const findNode = (nodes, key) => {
    for (const node of nodes) {
      if (node.key === key) return node;
      const found = findNode(node.children, key);
      if (found) return found;
    }
    return null;
  };
  const scopeNode = scope === "all" || scope === "excluded" ? null : findNode(tree, scope);
  const scopeRows = scope === "excluded" ? excluded : scopeNode ? scopeNode.all : members;
  const scopeLabel = scope === "excluded" ? "Không thuộc diện đánh giá" : scopeNode?.name ?? "Toàn trường";
  const keyword = search.trim().toLowerCase();
  const audiencesPresent = ["teacher", "staff", "leadership"].filter((value) => members.some((row) => row.audience === value));
  const needsBoard = selected.size > 0;
  const toggleScorer = (id) =>
    setScorers((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const visible = scopeRows.filter(
    (row) =>
      (!audience || row.audience === audience) &&
      (!keyword || `${row.name} ${row.code ?? ""}`.toLowerCase().includes(keyword)) &&
      (show === "all" || (show === "selected") === selected.has(row.teacher_id)),
  );

  const setMany = (list, value) =>
    setSelected((current) => {
      const next = new Set(current);
      list.filter(selectable).forEach((row) => (value ? next.add(row.teacher_id) : next.delete(row.teacher_id)));
      return next;
    });
  const toggle = (row) => setMany([row], !selected.has(row.teacher_id));
  const groupState = (list) => {
    const pickable = list.filter(selectable);
    const chosen = list.filter((row) => selected.has(row.teacher_id)).length;
    const all = pickable.length > 0 && pickable.every((row) => selected.has(row.teacher_id));
    return { pickable, chosen, all, some: !all && chosen > 0 };
  };
  const toggleCollapse = (key) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const title = editing ? `Sửa kỳ ${roster?.period?.label ?? ""}` : form ? `Mở kỳ đánh giá Tháng ${form.month}/${form.year}` : "Mở kỳ đánh giá";
  const backTo = editing ? `/evaluations?tab=board&period=${periodId}` : "/evaluations?tab=board";
  const changes = [added.length && `+${added.length}`, removed.length && `−${removed.length}`].filter(Boolean).join(" / ");

  const submit = async () => {
    if (!selected.size) {
      setError("Chọn ít nhất một nhân sự.");
      return;
    }
    if (needsBoard && !scorers.size) {
      setError("Chọn ít nhất một người chấm cột “BGH đánh giá”.");
      return;
    }
    const losing = removed.filter((row) => row.evaluation.has_data);
    if (editing && losing.length) {
      const ok = await confirm({
        tone: "danger",
        title: `Gỡ ${removed.length} phiếu khỏi kỳ?`,
        message: `Phiếu của ${losing.map((row) => row.name).join(", ")} đã có dữ liệu tự chấm và sẽ bị xóa vĩnh viễn. Người bị gỡ sẽ nhận thông báo không thuộc diện đánh giá kỳ này.`,
        confirmText: "Gỡ phiếu",
      });
      if (!ok) return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        self_due_on: form.self_due_on || null,
        unit_due_on: form.unit_due_on || null,
        teacher_ids: [...selected],
        scorer_ids: [...scorers],
        sheet_scorers: rows
          .filter((row) => selected.has(row.teacher_id))
          .flatMap((row) =>
            (row.audience === "teacher" ? ["unit", "leader"] : ["unit"])
              .filter((column) => sheetScorers[row.teacher_id]?.[column]?.length || (column === "unit" ? row.evaluation?.scorer_ids : row.evaluation?.leader_scorer_ids)?.length)
              .map((column) => ({ teacher_id: row.teacher_id, column, user_ids: sheetScorers[row.teacher_id]?.[column] ?? [] })),
          ),
      };
      const result = editing
        ? await apiJson(`/api/evaluation-periods/${periodId}`, { method: "PUT", body })
        : await apiJson("/api/evaluation-periods", { method: "POST", body: { ...body, year: Number(form.year), month: Number(form.month) } });
      navigate(`/evaluations?tab=board&period=${result.data.id}`, { state: { message: result.message } });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  if (!roster || !form) {
    return (
      <div className="ev-page">
        {error ? (
          <div className="api-error"><TriangleAlert size={16} />{error}<Link to={backTo}>Quay lại</Link></div>
        ) : (
          <div className="empty-state"><Users className="loading-icon" size={30} /><b>Đang tải danh sách nhân sự...</b></div>
        )}
      </div>
    );
  }

  const head = groupState(visible);
  const candidateById = Object.fromEntries((roster.assignable_scorers ?? []).map((candidate) => [candidate.id, candidate]));
  const defaultFor = (row, slot) =>
    slot === "unit"
      ? ["Tổ trưởng, tổ phó, nhóm trưởng của đơn vị"]
      : roster.scorer_candidates.filter((candidate) => scorers.has(candidate.id) && candidate.employee_id !== row.teacher_id).map((candidate) => candidate.name);
  const assignedOf = (row, slot) => {
    const column = columnOf(row, slot);
    return column ? sheetScorers[row.teacher_id]?.[column] ?? [] : [];
  };
  const bulkTargets = (slot) => visible.filter((row) => selected.has(row.teacher_id) && columnOf(row, slot));
  const applyScorers = async (ids) => {
    const { slot, rows: targets, bulk } = assigning;
    const names = ids.map((id) => candidateById[id]?.name ?? "?").join(", ");
    if (bulk) {
      const ok = await confirm({
        title: `Đổi người chấm · ${SLOT_LABELS[slot]} cho ${targets.length} phiếu?`,
        message: ids.length ? `Chỉ định ${names} chấm cột ${slot === "unit" ? "tổ" : "BGH đánh giá"} của các phiếu đã chọn đang hiển thị.` : "Các phiếu đã chọn đang hiển thị sẽ dùng lại người chấm mặc định.",
        confirmText: "Đổi người chấm",
      });
      if (!ok) return;
    }
    const updates = {};
    const skipped = [];
    targets.forEach((row) => {
      const column = columnOf(row, slot);
      const own = ids.filter((id) => candidateById[id]?.employee_id !== row.teacher_id);
      if (ids.length && !own.length) {
        skipped.push(row.name);
        return;
      }
      updates[row.teacher_id] = { ...(updates[row.teacher_id] ?? {}), [column]: own };
    });
    setSheetScorers((current) => {
      const next = { ...current };
      Object.entries(updates).forEach(([id, change]) => (next[id] = { ...(next[id] ?? {}), ...change }));
      return next;
    });
    if (bulk) setNotice(`Đã đổi người chấm · ${SLOT_LABELS[slot]} cho ${Object.keys(updates).length} phiếu${skipped.length ? `; bỏ qua phiếu của ${skipped.join(", ")} vì không ai chấm phiếu của chính mình` : ""}. Bấm “${editing ? "Lưu thay đổi" : "Mở kỳ"}” để áp dụng.`);
    setAssigning(null);
  };
  const scorerCell = (row, slot) => {
    if (!selected.has(row.teacher_id) || !columnOf(row, slot)) return <span className="ev-muted">—</span>;
    const ids = assignedOf(row, slot);
    return (
      <span className="ev-assign-line">
        {ids.length ? (
          <span className="ev-chip purple" title="Chỉ định riêng">{ids.map((id) => candidateById[id]?.name ?? "?").join(", ")}</span>
        ) : (
          <span className="ev-muted">Mặc định</span>
        )}
        <button type="button" className="ev-assign-btn" disabled={locked} onClick={() => setAssigning({ slot, rows: [row], bulk: false })}>Đổi</button>
      </span>
    );
  };
  const scorerHeader = (slot) => {
    const targets = bulkTargets(slot);
    return (
      <th className="ev-scorer-col">
        <span className="ev-th-assign">
          Người chấm · {SLOT_LABELS[slot]}
          <button
            type="button"
            className="ev-assign-btn"
            disabled={locked || !targets.length}
            title={targets.length ? `Đổi cho ${targets.length} phiếu đã chọn đang hiển thị` : "Chọn phiếu trong danh sách bên dưới để đổi hàng loạt"}
            onClick={() => setAssigning({ slot, rows: targets, bulk: true })}
          >
            Đổi{targets.length ? ` (${targets.length})` : ""}
          </button>
        </span>
      </th>
    );
  };

  return (
    <div className="ev-page ev-period-page">
      <section className="ev-tpl-title">
        <Link className="ev-back" to={backTo}><ArrowLeft size={16} /> Đánh giá tháng</Link>
        <div><h2>{title}</h2></div>
        <div className="ev-tpl-actions">
          <span className="ev-dialog-count">
            Đã chọn <b>{selected.size}</b> người{editing && changes ? ` · ${changes} phiếu` : ""}
          </span>
          <button className="secondary-btn" onClick={() => navigate(backTo)} disabled={saving}>Hủy</button>
          <button className="primary-btn" onClick={submit} disabled={saving || locked || !selected.size}>
            {saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : `Mở kỳ (${selected.size} phiếu)`}
          </button>
        </div>
      </section>

      {error && (
        <div className="api-error">
          <TriangleAlert size={16} />
          {error}
          <button onClick={() => setError("")}>Đóng</button>
        </div>
      )}
      {locked && <div className="ev-notice warn"><Lock size={14} /> Kỳ đã công bố nên không sửa được. Mở lại kỳ trước khi thay đổi.</div>}
      {notice && (
        <div className="ev-notice">
          <Check size={14} /> {notice}
          <button type="button" className="ev-link-btn" onClick={() => setNotice("")}>Đóng</button>
        </div>
      )}

      <section className="ev-card ev-period-setup">
        {!editing && (
          <>
            <label>
              Tháng
              <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
              </select>
            </label>
            <label>
              Năm
              <input type="number" min="2020" max="2100" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </label>
          </>
        )}
        <label>
          Hạn tự chấm
          <input type="date" value={form.self_due_on} disabled={locked} onChange={(e) => setForm({ ...form, self_due_on: e.target.value })} />
        </label>
        <label>
          Hạn chấm phiếu
          <input type="date" value={form.unit_due_on} disabled={locked} onChange={(e) => setForm({ ...form, unit_due_on: e.target.value })} />
        </label>
        <div className="ev-period-template">
          <ListChecks size={16} />
          <span>
            {editing ? "Bộ tiêu chí cho phiếu mới" : "Bộ tiêu chí áp dụng"}
            {roster.templates
              .filter((item) => audiencesPresent.includes(item.audience))
              .map((item) => (
                <em key={item.audience}>
                  {AUDIENCE_SHORT[item.audience]}: {item.active ? <Link to={`/evaluations/templates/${item.active.id}`}>{item.active.name}</Link> : <b className="ev-text-red">Chưa có</b>}
                </em>
              ))}
          </span>
        </div>
      </section>

      {(needsBoard || scorers.size > 0) && (
        <section className={`ev-card ev-period-scorers ${needsBoard && !scorers.size ? "missing" : ""}`}>
          <header>
            <ShieldCheck size={16} />
            <span>
              <b>Người chấm cột “BGH đánh giá”</b>
              <small>Mặc định cho cột “BGH đánh giá” của mọi phiếu: phiếu Giáo viên chấm sau khi tổ chấm xong, phiếu Nhân viên và Ban giám hiệu chấm trực tiếp. Không ai chấm phiếu của chính mình — người khác trong danh sách sẽ chấm.</small>
            </span>
          </header>
          <div className="ev-scorer-list">
            {roster.scorer_candidates.map((candidate) => {
              const active = scorers.has(candidate.id);
              return (
                <button key={candidate.id} type="button" disabled={locked} className={`ev-scorer ${active ? "active" : ""}`} onClick={() => toggleScorer(candidate.id)} aria-pressed={active}>
                  <Avatar src={candidate.avatar_url} name={candidate.name} size={28} />
                  <span>
                    <b>{candidate.name}</b>
                    <small>{candidate.roles.slice(0, 2).join(" · ")}</small>
                  </span>
                  {active && <Check size={15} />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="ev-period-panes">
        <aside className="ev-card ev-unit-pane">
          <h3>Đơn vị</h3>
          <div className="ev-unit-tree">
            <UnitItem label="Toàn trường" icon={Building2} list={members} active={scope === "all"} depth={0} groupState={groupState} onPick={() => setScope("all")} onCheck={(value) => setMany(members, value)} />
            {tree.map((node) => (
              <UnitNode key={node.key} node={node} scope={scope} collapsed={collapsed} groupState={groupState} onPick={setScope} onCheck={setMany} onToggle={toggleCollapse} />
            ))}
            {excluded.length > 0 && (
              <button type="button" className={`ev-unit-excluded ${scope === "excluded" ? "active" : ""}`} onClick={() => setScope("excluded")}>
                <UserX size={15} />
                <span>Không thuộc diện đánh giá</span>
                <small>{excluded.length}</small>
              </button>
            )}
          </div>
        </aside>

        <section className="ev-card ev-people-pane">
          <div className="ev-people-toolbar">
            <select className="ev-unit-select" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Đơn vị">
              <option value="all">Toàn trường</option>
              {flatten(tree).map((node) => <option key={node.key} value={node.key}>{"— ".repeat(node.depth)}{node.name}</option>)}
              {excluded.length > 0 && <option value="excluded">Không thuộc diện đánh giá</option>}
            </select>
            <label className="ev-search">
              <Search size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc mã nhân sự..." />
            </label>
            {audiencesPresent.length > 1 && (
              <div className="ev-segment" role="group" aria-label="Đối tượng">
                {[["", "Tất cả"], ...audiencesPresent.map((value) => [value, AUDIENCE_SHORT[value]])].map(([value, label]) => (
                  <button key={value} type="button" className={audience === value ? "active" : ""} onClick={() => setAudience(value)}>{label}</button>
                ))}
              </div>
            )}
            {scope !== "excluded" && (
              <div className="ev-segment" role="group" aria-label="Lọc">
                {[["all", "Tất cả"], ["selected", "Đã chọn"], ["unselected", "Chưa chọn"]].map(([value, label]) => (
                  <button key={value} type="button" className={show === value ? "active" : ""} onClick={() => setShow(value)}>{label}</button>
                ))}
              </div>
            )}
            <span className="ev-people-scope">
              Đang xem <b>{scopeLabel}</b> · {visible.length} người
            </span>
          </div>
          {scope === "excluded" && <p className="ev-dialog-note ev-people-note">Muốn đánh giá những người này, hãy cập nhật hồ sơ ở màn Nhân sự trước.</p>}
          <div className="ev-people-scroll">
            <table className="ev-table ev-people-table">
              <thead>
                <tr>
                  <th className="check">
                    <TriCheckbox checked={head.all} indeterminate={head.some} disabled={!head.pickable.length} onChange={() => setMany(visible, !head.all)} label="Chọn tất cả đang hiển thị" />
                  </th>
                  <th>Nhân sự</th>
                  <th>Đơn vị</th>
                  <th>Vai trò</th>
                  {scorerHeader("unit")}
                  {scorerHeader("board")}
                  <th>{editing ? "Phiếu" : "Ghi chú"}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const disabled = !selectable(row);
                  return (
                    <tr key={row.teacher_id} className={`${disabled ? "disabled" : "clickable"} ${selected.has(row.teacher_id) ? "selected" : ""}`} onClick={() => !disabled && toggle(row)}>
                      <td className="check">
                        <input type="checkbox" checked={selected.has(row.teacher_id)} disabled={disabled} onChange={() => toggle(row)} onClick={(e) => e.stopPropagation()} aria-label={`Chọn ${row.name}`} />
                      </td>
                      <td>
                        <span className="ev-person">
                          {row.avatar_url ? <img src={row.avatar_url} alt="" /> : <Avatar name={row.name} />}
                          <span>
                            <b>{row.name}{row.audience !== "teacher" && <em className="ev-tag audience">{AUDIENCE_SHORT[row.audience]}</em>}</b>
                            <small>{[row.code, row.other_units?.length > 0 && `Cũng thuộc: ${row.other_units.join(", ")}`].filter(Boolean).join(" · ")}</small>
                          </span>
                        </span>
                      </td>
                      <td>{unitName(row.unit_id) ?? <span className="ev-muted">—</span>}</td>
                      <td>
                        <span className="ev-role-list">
                          {row.roles?.length ? (
                            row.roles.map((role, index) => (
                              <span key={index} className="ev-role-chip">
                                {role.name}
                                {role.unit_id && role.unit_id !== row.unit_id ? ` · ${unitName(role.unit_id) ?? ""}` : ""}
                              </span>
                            ))
                          ) : (
                            <span className="ev-muted">{row.audience === "staff" ? "Nhân viên" : "Giáo viên"}</span>
                          )}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>{scorerCell(row, "unit")}</td>
                      <td onClick={(e) => e.stopPropagation()}>{scorerCell(row, "board")}</td>
                      <td>
                        {row.evaluation ? (
                          <span className="ev-roster-tags">
                            <span className={`ev-chip ${STATUS_TONES[row.evaluation.status]}`} title={row.lock_reason ?? undefined}>
                              {row.lock_reason && <Lock size={11} />} {row.evaluation.status_label}
                            </span>
                            {row.evaluation.has_data && row.evaluation.status === "draft" && <span className="ev-chip orange">Có dữ liệu</span>}
                          </span>
                        ) : null}
                        {row.reason && !row.evaluation && <small className="ev-sub">{row.reason}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && <div className="empty-state"><Search size={26} /><b>Không có nhân sự phù hợp</b></div>}
          </div>
        </section>
      </div>
      {assigning && (
        <EvaluationScorerPicker
          bulk={assigning.bulk}
          title={assigning.bulk ? `Đổi người chấm · ${SLOT_LABELS[assigning.slot]} cho ${assigning.rows.length} phiếu` : `Người chấm · ${SLOT_LABELS[assigning.slot]} riêng cho phiếu`}
          subject={assigning.bulk ? `Các phiếu đã chọn đang hiển thị${editing ? "" : " · áp dụng khi mở kỳ"}` : `${assigning.rows[0].name}${editing ? "" : " · áp dụng khi mở kỳ"}`}
          candidates={(roster.assignable_scorers ?? []).filter((candidate) => assigning.bulk || candidate.employee_id !== assigning.rows[0].teacher_id)}
          selected={assigning.bulk ? [] : assignedOf(assigning.rows[0], assigning.slot)}
          defaultScorers={assigning.bulk ? [] : defaultFor(assigning.rows[0], assigning.slot)}
          onSave={applyScorers}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

function flatten(nodes) {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function UnitItem({ label, icon: Icon, list, active, depth, groupState, onPick, onCheck, toggle }) {
  const state = groupState(list);
  return (
    <div className={`ev-unit-item ${active ? "active" : ""}`} style={{ paddingLeft: 8 + depth * 18 }} onClick={onPick}>
      {toggle ?? <span className="ev-unit-spacer" />}
      <TriCheckbox checked={state.all} indeterminate={state.some} disabled={!state.pickable.length} onChange={() => onCheck(!state.all)} label={`Chọn cả ${label}`} />
      {Icon && <Icon size={15} className="ev-unit-icon" />}
      <span className="ev-unit-name">{label}</span>
      <small>{state.chosen}/{list.length}</small>
    </div>
  );
}

function UnitNode({ node, scope, collapsed, groupState, onPick, onCheck, onToggle }) {
  const open = !collapsed.has(node.key);
  const toggle = node.children.length ? (
    <button type="button" className={`ev-roster-chevron ${open ? "open" : ""}`} onClick={(e) => { e.stopPropagation(); onToggle(node.key); }} aria-label={open ? "Thu gọn" : "Mở rộng"}>
      <ChevronRight size={15} />
    </button>
  ) : null;
  return (
    <>
      <UnitItem label={node.name} list={node.all} active={scope === node.key} depth={node.depth + 1} groupState={groupState} onPick={() => onPick(node.key)} onCheck={(value) => onCheck(node.all, value)} toggle={toggle} />
      {open && node.children.map((child) => (
        <UnitNode key={child.key} node={child} scope={scope} collapsed={collapsed} groupState={groupState} onPick={onPick} onCheck={onCheck} onToggle={onToggle} />
      ))}
    </>
  );
}
