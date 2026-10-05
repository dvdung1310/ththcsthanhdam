import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Award, CalendarPlus, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Trash2, Megaphone, MessageSquare, RotateCcw, Search, Send, Settings2, TriangleAlert, X } from "lucide-react";
import { apiJson } from "./api";
import ActionMenu from "./ActionMenu";
import { useConfirm } from "./ConfirmDialog";
import TablePagination, { usePagination } from "./TablePagination";
import { STATUS_TONES, daysPast, formatDay, formatScore } from "./evaluationUtils";
import "./Evaluation.css";

const STATUS_FILTERS = [
  ["", "Tất cả"],
  ["draft", "Chưa nộp"],
  ["submitted", "Đã nộp"],
  ["unit_scored", "Tổ đã chấm"],
  ["published", "Đã công bố"],
];

const PERIOD_STEPS = [
  ["open", "Chấm phiếu"],
  ["disclosed", "Giải trình"],
  ["published", "Công bố"],
];

export default function EvaluationHome() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState(null);
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const location = useLocation();
  const [success, setSuccess] = useState(location.state?.message ?? "");
  const [deleting, setDeleting] = useState(null);
  const [filters, setFilters] = useState({ status: "", department_id: "", search: "" });
  const [collapsed, setCollapsed] = useState(() => new Set());

  const abilities = overview?.abilities ?? {};
  const canBoard = abilities.can_score || abilities.can_manage;
  const hasOwn = overview?.data.some((period) => period.my_evaluation);
  const tab = params.get("tab") === "board" && canBoard ? "board" : !hasOwn && canBoard ? "board" : "mine";
  const periodId = Number(params.get("period")) || overview?.data[0]?.id || null;
  const period = overview?.data.find((item) => item.id === periodId) ?? null;

  const setParam = (values) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(values).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      return next;
    }, { replace: true });

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await apiJson("/api/evaluation-periods"));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadBoard = useCallback(async () => {
    if (!periodId || tab !== "board") return;
    const query = new URLSearchParams({ period_id: periodId });
    Object.entries(filters).forEach(([key, value]) => value && query.set(key, value));
    try {
      setBoard(await apiJson(`/api/evaluations?${query}`));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [periodId, tab, filters]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    if (location.state?.message) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, []);
  useEffect(() => {
    const timer = setTimeout(loadBoard, filters.search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadBoard, filters.search]);
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(timer);
  }, [success]);

  const run = async (request, after) => {
    try {
      const result = await request();
      setSuccess(result.message);
      await loadOverview();
      await loadBoard();
      after?.(result);
    } catch (e) {
      setError(e.message);
    }
  };

  const disclose = async () => {
    const ok = await confirm({ title: `Gửi kết quả dự kiến ${period.label}?`, message: "Giáo viên sẽ xem được điểm tổ chấm, điểm chốt và xếp loại dự kiến của mình, và có thể gửi giải trình trước khi công bố.", confirmText: "Gửi kết quả" });
    if (ok) run(() => apiJson(`/api/evaluation-periods/${period.id}/disclose`, { method: "POST" }));
  };
  const publish = async () => {
    let pending = [];
    try {
      const all = await apiJson(`/api/evaluations?period_id=${period.id}`);
      pending = all.data.filter((row) => row.status !== "unit_scored" && row.status !== "published");
    } catch (e) {
      setError(e.message);
      return;
    }
    const names = pending.slice(0, 10).map((row) => `${row.teacher.name} (${row.status_label.toLowerCase()})`).join(", ");
    const ok = await confirm({
      tone: pending.length ? "danger" : undefined,
      title: `Công bố kết quả ${period.label}?`,
      message: pending.length
        ? `Còn ${pending.length} phiếu chưa chấm xong: ${names}${pending.length > 10 ? "…" : ""}. Các phiếu này sẽ được công bố theo điểm hiện có. Nếu ai không cần đánh giá kỳ này, hãy trả phiếu về rồi gỡ khỏi kỳ trong “Sửa kỳ” trước. Sau khi công bố, phiếu bị khóa.`
        : "Sau khi công bố, phiếu bị khóa và giáo viên nhận thông báo kết quả.",
      confirmText: "Công bố",
    });
    if (ok) run(() => apiJson(`/api/evaluation-periods/${period.id}/publish`, { method: "POST" }));
  };
  const reopen = async () => {
    const ok = await confirm({ title: `Mở lại ${period.label}?`, message: "Kỳ chuyển về trạng thái chờ giải trình để điều chỉnh điểm. Cần công bố lại sau khi sửa.", confirmText: "Mở lại" });
    if (ok) run(() => apiJson(`/api/evaluation-periods/${period.id}/reopen`, { method: "POST" }));
  };

  const counts = useMemo(() => {
    const result = { "": board?.data.length ?? 0 };
    board?.data.forEach((row) => (result[row.status] = (result[row.status] ?? 0) + 1));
    return result;
  }, [board]);

  const groups = useMemo(() => groupByUnit(board?.data), [board]);
  const groupKeys = groups?.map((group) => group.key) ?? [];

  if (!overview) return <div className="ev-page"><div className="empty-state"><Award className="loading-icon" size={34} /><b>Đang tải...</b></div></div>;

  return (
    <div className="ev-page">
      {success && (
        <div className="success-toast" role="status">
          <span><CheckCircle2 size={20} /></span>
          <div><b>Thành công</b><small>{success}</small></div>
          <button onClick={() => setSuccess("")}><X size={17} /></button>
        </div>
      )}

      <section className="ev-hero">
        <p>
          Bộ tiêu chí đang áp dụng:{" "}
          {abilities.can_manage && overview.template ? (
            <Link to={`/evaluations/templates/${overview.template.id}`}><b>{overview.template.name}</b></Link>
          ) : (
            <b>{overview.template?.name ?? "Chưa có"}</b>
          )}
        </p>
        {abilities.can_manage && (
          <div className="ev-hero-actions">
            <button className="primary-btn" onClick={() => navigate("/evaluations/periods/new")}>
              <CalendarPlus size={16} /> Mở kỳ đánh giá
            </button>
          </div>
        )}
      </section>

      {(hasOwn || !canBoard) && canBoard && (
        <nav className="ev-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : ""} onClick={() => setParam({ tab: "" })}>
            <ClipboardList size={16} /> Phiếu của tôi
          </button>
          <button role="tab" aria-selected={tab === "board"} className={tab === "board" ? "active" : ""} onClick={() => setParam({ tab: "board" })}>
            <Award size={16} /> {abilities.can_manage ? "Chấm & duyệt phiếu" : "Chấm phiếu của tổ"}
          </button>
        </nav>
      )}

      {error && (
        <div className="api-error">
          <TriangleAlert size={16} />
          {error}
          <button onClick={() => setError("")}>Đóng</button>
        </div>
      )}

      {tab === "mine" ? (
        <MySheets periods={overview.data} />
      ) : (
        <section className="ev-card">
          <div className={`ev-board-head ${overview.data.length ? "" : "empty"}`}>
            {overview.data.length > 0 && (
              <label className="ev-period-select">
                <span>Kỳ đánh giá</span>
                <select value={periodId ?? ""} onChange={(e) => setParam({ period: e.target.value })}>
                  {overview.data.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            )}
            {period && <PeriodSteps status={period.status} />}
            {period && abilities.can_manage && (
              <div className="ev-period-actions">
                {period.status === "open" && <button className="primary-btn" onClick={disclose}><Send size={15} /> Gửi kết quả dự kiến</button>}
                {period.status === "disclosed" && <button className="primary-btn" onClick={publish}><Megaphone size={15} /> Công bố</button>}
                {period.status === "published" && <button className="secondary-btn" onClick={reopen}><RotateCcw size={15} /> Mở lại</button>}
                {period.status !== "published" && (
                  <ActionMenu
                    className="ev-period-more"
                    items={[
                      { key: "edit", label: "Sửa kỳ", icon: Settings2, onClick: () => navigate(`/evaluations/periods/${period.id}/edit`) },
                      { key: "publish", label: "Công bố ngay", icon: Megaphone, onClick: publish, hidden: period.status !== "open" },
                      { divider: true },
                      { key: "delete", label: "Xóa kỳ", icon: Trash2, danger: true, onClick: () => setDeleting(period) },
                    ]}
                  />
                )}
              </div>
            )}
            {period && (
              <div className="ev-period-meta">
                <DueDate label="Hạn tự chấm" due={period.self_due_on} active={period.status === "open"} />
                <DueDate label="Hạn tổ chấm" due={period.unit_due_on} active={period.status === "open"} />
              </div>
            )}
          </div>

          {!period ? (
            <div className="empty-state">
              <CalendarPlus size={34} />
              <b>Chưa có kỳ đánh giá nào</b>
              {abilities.can_manage && <span>Bấm “Mở kỳ đánh giá” để tạo phiếu cho giáo viên.</span>}
            </div>
          ) : (
            <>
              <div className="ev-filters">
                <div className="ev-status-chips">
                  {STATUS_FILTERS.map(([value, label]) => (
                    <button key={value} className={filters.status === value ? "active" : ""} onClick={() => setFilters((f) => ({ ...f, status: value }))}>
                      {label} <em>{value ? counts[value] ?? 0 : counts[""]}</em>
                    </button>
                  ))}
                </div>
                {board?.units?.length > 1 && (
                  <select value={filters.department_id} onChange={(e) => setFilters((f) => ({ ...f, department_id: e.target.value }))}>
                    <option value="">Mọi tổ / nhóm</option>
                    {board.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </select>
                )}
                <label className="ev-search">
                  <Search size={15} />
                  <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Tìm giáo viên..." />
                </label>
              </div>
              {board?.not_included?.length > 0 && (
                <details className="ev-excluded">
                  <summary>
                    {board.not_included.length} giáo viên không tham gia kỳ này
                  </summary>
                  <p>{board.not_included.join(", ")}</p>
                </details>
              )}
              <BoardTable
                groups={groups}
                period={period}
                collapsed={collapsed}
                onToggleAll={() => setCollapsed(collapsed.size ? new Set() : new Set(groupKeys))}
                onToggle={(key) => setCollapsed((current) => {
                  const next = new Set(current);
                  next.has(key) ? next.delete(key) : next.add(key);
                  return next;
                })}
                onOpen={(id) => navigate(`/evaluations/${id}`)}
              />
            </>
          )}
        </section>
      )}

      {deleting && (
        <DeletePeriodDialog
          period={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async (result) => {
            setDeleting(null);
            setSuccess(result.message);
            setBoard(null);
            setParam({ period: "" });
            await loadOverview();
          }}
        />
      )}
    </div>
  );
}

function PeriodSteps({ status }) {
  const current = PERIOD_STEPS.findIndex(([key]) => key === status);
  return (
    <ol className="ev-steps">
      {PERIOD_STEPS.map(([key, label], index) => {
        const state = index < current || status === "published" ? "done" : index === current ? "current" : "";
        return (
          <li key={key} className={state}>
            <i>{state === "done" ? <Check size={12} /> : index + 1}</i>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function DueDate({ label, due, active }) {
  const past = active ? daysPast(due) : null;
  return (
    <span>
      {label} <b>{formatDay(due)}</b>
      {due && past !== null && (past > 0 ? <em className="ev-due late">quá {past} ngày</em> : past >= -3 && <em className="ev-due soon">{past === 0 ? "hôm nay" : `còn ${-past} ngày`}</em>)}
    </span>
  );
}

function groupByUnit(rows) {
  if (!rows) return null;
  const map = new Map();
  rows.forEach((row) => {
    const key = row.unit?.id ?? 0;
    if (!map.has(key)) map.set(key, { key, name: row.unit?.name ?? "Chưa thuộc tổ", rows: [] });
    map.get(key).rows.push(row);
  });
  return [...map.values()].sort((a, b) => (!a.key) - (!b.key) || a.name.localeCompare(b.name, "vi"));
}

function deadlineNote(row, period) {
  if (period.status === "open") {
    const selfPast = daysPast(period.self_due_on);
    const unitPast = daysPast(period.unit_due_on);
    if (row.status === "draft" && period.self_due_on && selfPast > 0) return { tone: "late", text: `Trễ hạn ${selfPast} ngày` };
    if (row.status === "submitted" && period.unit_due_on && unitPast > 0) return { tone: "late", text: `Tổ chấm trễ ${unitPast} ngày` };
  }
  if (row.submitted_at && period.self_due_on && daysPast(period.self_due_on, row.submitted_at) > 0) return { tone: "warn", text: "Nộp sau hạn" };
  return null;
}

function MySheets({ periods }) {
  const rows = periods.filter((period) => period.my_evaluation);
  const pager = usePagination(rows, 12);
  if (!rows.length) {
    return (
      <section className="ev-card">
        <div className="empty-state">
          <ClipboardList size={34} />
          <b>Chưa có phiếu đánh giá nào</b>
          <span>Khi nhà trường mở kỳ đánh giá tháng, phiếu của bạn sẽ hiện ở đây.</span>
        </div>
      </section>
    );
  }
  return (
    <section className="ev-card">
      <div className="ev-table-wrap">
        <table className="ev-table ev-mine-table">
          <thead>
            <tr>
              <th>Kỳ đánh giá</th>
              <th>Trạng thái phiếu</th>
              <th className="num">Tự chấm</th>
              <th className="num">Kết quả</th>
              <th>Xếp loại</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {pager.rows.map((period) => {
              const sheet = period.my_evaluation;
              const editable = period.status === "open" && sheet.status === "draft";
              const past = daysPast(period.self_due_on);
              return (
                <tr key={period.id}>
                  <td><b>{period.label}</b><small className="ev-sub">{period.status_label}</small></td>
                  <td>
                    <span className={`ev-chip ${STATUS_TONES[sheet.status]}`}>{sheet.status_label}</span>
                    {editable && period.self_due_on ? (
                      <small className={past > 0 ? "ev-late" : "ev-sub"}>
                        {past > 0 ? `Quá hạn ${past} ngày` : past === 0 ? "Hạn nộp hôm nay" : `Hạn ${formatDay(period.self_due_on)} · còn ${-past} ngày`}
                      </small>
                    ) : (
                      sheet.submitted_at && <small className="ev-sub">Nộp {formatDay(sheet.submitted_at)}</small>
                    )}
                  </td>
                  <td className="num">{formatScore(sheet.self_total)}</td>
                  <td className="num">
                    {sheet.total_score != null ? (
                      <>
                        <b>{formatScore(sheet.total_score)}</b>
                        {period.status === "disclosed" && <small className="ev-sub">dự kiến</small>}
                      </>
                    ) : (
                      <span className="ev-muted">{sheet.status === "draft" ? "—" : "Chờ kết quả"}</span>
                    )}
                  </td>
                  <td>{sheet.grade ?? <span className="ev-muted">—</span>}</td>
                  <td className="ev-row-action">
                    <Link className={editable ? "primary-btn" : "secondary-btn"} to={`/evaluations/${sheet.id}`}>
                      {editable ? "Tự chấm" : "Xem phiếu"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && <TablePagination pager={pager} noun="phiếu" sizes={[12, 24, 48]} />}
    </section>
  );
}

function ScoreDiff({ self, unit }) {
  if (self == null || unit == null) return null;
  const diff = Math.round((unit - self) * 100) / 100;
  if (!diff) return null;
  return (
    <small className={`ev-diff ${diff < 0 ? "down" : "up"} ${Math.abs(diff) >= 2 ? "big" : ""}`} title="Chênh lệch so với điểm tự chấm">
      {diff < 0 ? "▼" : "▲"} {formatScore(Math.abs(diff))}
    </small>
  );
}

function GroupRow({ group, period, open, onToggle }) {
  const total = group.rows.length;
  const submitted = group.rows.filter((row) => row.status !== "draft").length;
  const scored = group.rows.filter((row) => row.status === "unit_scored" || row.status === "published").length;
  const late = group.rows.filter((row) => deadlineNote(row, period)?.tone === "late").length;
  return (
    <tr className="ev-group-row" onClick={onToggle}>
      <td colSpan={8}>
        <span className="ev-group-title">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <b>{group.name}</b>
          <em>{total}</em>
        </span>
        <span className="ev-group-progress">
          <span>Đã nộp <b>{submitted}/{total}</b></span>
          <span>Tổ chấm <b>{scored}/{total}</b></span>
          {late > 0 && <span className="late">{late} trễ hạn</span>}
          <span className="ev-progress" aria-hidden="true">
            <i className="scored" style={{ width: `${(scored / total) * 100}%` }} />
            <i className="submitted" style={{ width: `${((submitted - scored) / total) * 100}%` }} />
          </span>
        </span>
      </td>
    </tr>
  );
}

function BoardTable({ groups, period, collapsed, onToggle, onToggleAll, onOpen }) {
  if (!groups) return <div className="empty-state"><Award className="loading-icon" size={30} /><b>Đang tải...</b></div>;
  if (!groups.length) return <div className="empty-state"><Search size={30} /><b>Không có phiếu phù hợp</b></div>;
  return (
    <div className="ev-table-wrap ev-board-wrap">
      <table className="ev-table ev-board-table">
        <thead>
          <tr>
            <th>
              Giáo viên
              {groups.length > 1 && (
                <button className="ev-link-btn" onClick={onToggleAll}>{collapsed.size ? "Mở tất cả" : "Thu gọn tất cả"}</button>
              )}
            </th>
            <th>Trạng thái</th>
            <th className="num">Tự chấm</th>
            <th className="num">Tổ chấm</th>
            <th className="num" title="Điểm sau khi Hiệu trưởng duyệt">Chốt</th>
            <th>Xếp loại</th>
            <th aria-label="Giải trình" />
            <th aria-label="Mở" />
          </tr>
        </thead>
        {groups.map((group) => {
          const open = !collapsed.has(group.key);
          return (
            <tbody key={group.key}>
              <GroupRow group={group} period={period} open={open} onToggle={() => onToggle(group.key)} />
              {open && group.rows.map((row) => {
                const note = deadlineNote(row, period);
                const otherUnits = row.teacher.units.filter((name) => name !== group.name);
                return (
                  <tr key={row.id} className="clickable" onClick={() => onOpen(row.id)}>
                    <td>
                      <span className="ev-person">
                        {row.teacher.avatar_url ? <img src={row.teacher.avatar_url} alt="" /> : <i>{row.teacher.name?.split(" ").at(-1)?.charAt(0)}</i>}
                        <span>
                          <b>{row.teacher.name}</b>
                          <small>{[...otherUnits, row.is_homeroom ? "GVCN" : null].filter(Boolean).join(" · ") || row.teacher.code}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`ev-chip ${STATUS_TONES[row.status]}`}>{row.status_label}</span>
                      {note && <small className={note.tone === "late" ? "ev-late" : "ev-warn"}>{note.text}</small>}
                    </td>
                    <td className="num">{formatScore(row.self_total)}</td>
                    <td className="num">
                      {formatScore(row.unit_total)}
                      <ScoreDiff self={row.self_total} unit={row.unit_total} />
                    </td>
                    <td className="num">{row.final_total != null ? <b>{formatScore(row.final_total)}</b> : <span className="ev-muted">—</span>}</td>
                    <td>
                      {row.no_grade_reason ? <span className="ev-chip red">Không xếp loại</span> : row.grade ? <b>{row.grade}</b> : row.suggested_grade ? <span className="ev-muted">Gợi ý: {row.suggested_grade}</span> : <span className="ev-muted">—</span>}
                      {row.has_violation && <small className="ev-late">Có vi phạm</small>}
                    </td>
                    <td className="ev-comments">{row.comments_count > 0 && <span title="Trao đổi / giải trình"><MessageSquare size={14} /> {row.comments_count}</span>}</td>
                    <td className="ev-row-arrow"><ChevronRight size={18} /></td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function DeletePeriodDialog({ period, onClose, onDeleted }) {
  const [roster, setRoster] = useState(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    apiJson(`/api/evaluation-periods/roster?period_id=${period.id}`).then(setRoster).catch((e) => setError(e.message));
  }, [period.id]);
  const sheets = roster?.data.filter((row) => row.evaluation) ?? [];
  const withData = sheets.filter((row) => row.evaluation.has_data);
  const needsLabel = withData.length > 0;
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      onDeleted(await apiJson(`/api/evaluation-periods/${period.id}`, { method: "DELETE", body: { confirm_label: label.trim() } }));
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ev-dialog" onSubmit={submit}>
        <h3>Xóa kỳ đánh giá {period.label}?</h3>
        {!roster ? (
          <p className="ev-muted">Đang kiểm tra dữ liệu...</p>
        ) : (
          <>
            <p className="ev-dialog-note">
              Kỳ có {sheets.length} phiếu. Toàn bộ phiếu, điểm, minh chứng và trao đổi của kỳ sẽ bị xóa; giáo viên nhận thông báo kỳ đã được hủy. Sau đó có thể mở lại tháng này từ đầu.
            </p>
            {needsLabel && (
              <>
                <div className="ev-notice warn">
                  <TriangleAlert size={14} /> {withData.length} phiếu đã có người nhập liệu: {withData.slice(0, 8).map((row) => row.name).join(", ")}
                  {withData.length > 8 ? "…" : ""}. Dữ liệu này sẽ mất vĩnh viễn.
                </div>
                <label>
                  <span>Nhập <b>{period.label}</b> để xác nhận</span>
                  <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={period.label} />
                </label>
              </>
            )}
          </>
        )}
        {error && <p className="dl-dialog-error">{error}</p>}
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose}>Hủy</button>
          <button className="primary-btn danger" disabled={saving || !roster || (needsLabel && label.trim() !== period.label)}>
            <Trash2 size={15} /> {saving ? "Đang xóa..." : "Xóa kỳ"}
          </button>
        </footer>
      </form>
    </div>
  );
}
