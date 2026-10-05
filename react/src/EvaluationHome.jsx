import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Award, CalendarPlus, CheckCircle2, ClipboardList, ListChecks, Trash2, Users, Megaphone, MessageSquare, RotateCcw, Search, Send, Settings2, TriangleAlert, X } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { PERIOD_TONES, STATUS_TONES, formatDay, formatScore } from "./evaluationUtils";
import "./Evaluation.css";

const STATUS_FILTERS = [
  ["", "Tất cả"],
  ["draft", "Chưa nộp"],
  ["submitted", "Đã nộp"],
  ["unit_scored", "Tổ đã chấm"],
  ["published", "Đã công bố"],
];

export default function EvaluationHome() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState(null);
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [periodDialog, setPeriodDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filters, setFilters] = useState({ status: "", department_id: "", search: "" });

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
            <button className="primary-btn" onClick={() => setPeriodDialog({ mode: "open" })}>
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
            {period && (
              <div className="ev-period-meta">
                <span className={`ev-chip ${PERIOD_TONES[period.status]}`}>{period.status_label}</span>
                <span>Hạn tự chấm <b>{formatDay(period.self_due_on)}</b></span>
                <span>Hạn tổ chấm <b>{formatDay(period.unit_due_on)}</b></span>
              </div>
            )}
            {period && abilities.can_manage && (
              <div className="ev-period-actions">
                {period.status !== "published" && (
                  <>
                    <button className="secondary-btn" onClick={() => setPeriodDialog({ mode: "edit", period })}><Settings2 size={15} /> Sửa kỳ</button>
                    <button className="secondary-btn danger" onClick={() => setDeleting(period)}><Trash2 size={15} /> Xóa kỳ</button>
                  </>
                )}
                {period.status === "open" && <button className="secondary-btn" onClick={disclose}><Send size={15} /> Gửi kết quả dự kiến</button>}
                {period.status !== "published" && <button className="primary-btn" onClick={publish}><Megaphone size={15} /> Công bố</button>}
                {period.status === "published" && <button className="secondary-btn" onClick={reopen}><RotateCcw size={15} /> Mở lại</button>}
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
              <BoardTable rows={board?.data} onOpen={(id) => navigate(`/evaluations/${id}`)} />
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
      {periodDialog && (
        <PeriodDialog
          dialog={periodDialog}
          existing={overview.data}
          onClose={() => setPeriodDialog(null)}
          onSaved={(result) => {
            setPeriodDialog(null);
            setSuccess(result.message);
            loadOverview().then(() => setParam({ tab: "board", period: result.data.id }));
          }}
        />
      )}
    </div>
  );
}

function MySheets({ periods }) {
  const rows = periods.filter((period) => period.my_evaluation);
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
      <table className="ev-table">
        <thead>
          <tr>
            <th>Kỳ đánh giá</th>
            <th>Trạng thái phiếu</th>
            <th>Hạn tự chấm</th>
            <th className="num">Tổng điểm</th>
            <th>Xếp loại</th>
            <th aria-label="Thao tác" />
          </tr>
        </thead>
        <tbody>
          {rows.map((period) => {
            const sheet = period.my_evaluation;
            const late = sheet.status === "draft" && period.self_due_on && new Date(period.self_due_on) < new Date(new Date().toDateString());
            return (
              <tr key={period.id}>
                <td><b>{period.label}</b><small className="ev-sub">{period.status_label}</small></td>
                <td>
                  <span className={`ev-chip ${STATUS_TONES[sheet.status]}`}>{sheet.status_label}</span>
                  {late && <small className="ev-late">Quá hạn</small>}
                </td>
                <td>{formatDay(period.self_due_on)}</td>
                <td className="num">{formatScore(sheet.total_score)}</td>
                <td>{sheet.grade ?? <span className="ev-muted">—</span>}</td>
                <td className="ev-row-action">
                  <Link className={sheet.status === "draft" && period.status === "open" ? "primary-btn" : "secondary-btn"} to={`/evaluations/${sheet.id}`}>
                    {sheet.status === "draft" && period.status === "open" ? "Tự chấm" : "Xem phiếu"}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function BoardTable({ rows, onOpen }) {
  if (!rows) return <div className="empty-state"><Award className="loading-icon" size={30} /><b>Đang tải...</b></div>;
  if (!rows.length) return <div className="empty-state"><Search size={30} /><b>Không có phiếu phù hợp</b></div>;
  return (
    <div className="ev-table-wrap">
      <table className="ev-table">
        <thead>
          <tr>
            <th>Giáo viên</th>
            <th>Trạng thái</th>
            <th className="num">Tự chấm</th>
            <th className="num">Tổ chấm</th>
            <th className="num">Chốt</th>
            <th>Xếp loại</th>
            <th aria-label="Giải trình" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="clickable" onClick={() => onOpen(row.id)}>
              <td>
                <span className="ev-person">
                  {row.teacher.avatar_url ? <img src={row.teacher.avatar_url} alt="" /> : <i>{row.teacher.name?.split(" ").at(-1)?.charAt(0)}</i>}
                  <span>
                    <b>{row.teacher.name}</b>
                    <small>{[row.teacher.units.join(", "), row.is_homeroom ? "GVCN" : null].filter(Boolean).join(" · ")}</small>
                  </span>
                </span>
              </td>
              <td><span className={`ev-chip ${STATUS_TONES[row.status]}`}>{row.status_label}</span></td>
              <td className="num">{formatScore(row.self_total)}</td>
              <td className="num">{formatScore(row.unit_total)}</td>
              <td className="num"><b>{formatScore(row.final_total)}</b></td>
              <td>
                {row.no_grade_reason ? <span className="ev-chip red">Không xếp loại</span> : row.grade ? <b>{row.grade}</b> : row.suggested_grade ? <span className="ev-muted">Gợi ý: {row.suggested_grade}</span> : <span className="ev-muted">—</span>}
                {row.has_violation && <small className="ev-late">Có vi phạm</small>}
              </td>
              <td className="ev-comments">{row.comments_count > 0 && <span title="Trao đổi / giải trình"><MessageSquare size={14} /> {row.comments_count}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodDialog({ dialog, existing, onClose, onSaved }) {
  const confirm = useConfirm();
  const editing = dialog.mode === "edit";
  const pad = (n) => String(n).padStart(2, "0");
  const next = (() => {
    const now = new Date();
    for (let offset = 0; offset < 24; offset++) {
      const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      if (!existing.some((p) => p.year === date.getFullYear() && p.month === date.getMonth() + 1)) return date;
    }
    return now;
  })();
  const [tab, setTab] = useState("setup");
  const [form, setForm] = useState(
    editing
      ? { self_due_on: dialog.period.self_due_on ?? "", unit_due_on: dialog.period.unit_due_on ?? "" }
      : { year: next.getFullYear(), month: next.getMonth() + 1, self_due_on: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-25`, unit_due_on: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-28` },
  );
  const [roster, setRoster] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson(`/api/evaluation-periods/roster${editing ? `?period_id=${dialog.period.id}` : ""}`)
      .then((result) => {
        setRoster(result);
        setSelected(new Set(result.data.filter((row) => (editing ? row.evaluation : row.eligible)).map((row) => row.teacher_id)));
      })
      .catch((e) => setError(e.message));
  }, [editing, dialog.period?.id]);

  const rows = roster?.data ?? [];
  const selectable = (row) => (row.evaluation ? row.removable : row.eligible);
  const added = rows.filter((row) => !row.evaluation && selected.has(row.teacher_id));
  const removed = rows.filter((row) => row.evaluation && !selected.has(row.teacher_id));
  const keyword = search.trim().toLowerCase();
  const visible = rows.filter((row) => !keyword || `${row.name} ${row.code ?? ""}`.toLowerCase().includes(keyword));
  const groups = useMemo(() => {
    const map = new Map();
    visible.filter((row) => row.eligible || row.evaluation).forEach((row) => {
      const key = row.unit ?? "Chưa thuộc tổ nào";
      map.set(key, [...(map.get(key) ?? []), row]);
    });
    return [...map.entries()];
  }, [visible]);
  const excluded = visible.filter((row) => !row.eligible && !row.evaluation);

  const toggle = (row) =>
    setSelected((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(row.teacher_id)) nextSet.delete(row.teacher_id);
      else nextSet.add(row.teacher_id);
      return nextSet;
    });
  const toggleGroup = (members, value) =>
    setSelected((current) => {
      const nextSet = new Set(current);
      members.filter(selectable).forEach((row) => (value ? nextSet.add(row.teacher_id) : nextSet.delete(row.teacher_id)));
      return nextSet;
    });

  const submit = async (event) => {
    event.preventDefault();
    if (!selected.size) {
      setTab("people");
      setError("Chọn ít nhất một giáo viên.");
      return;
    }
    const losing = removed.filter((row) => row.evaluation.has_data);
    if (editing && losing.length) {
      const ok = await confirm({
        tone: "danger",
        title: `Gỡ ${removed.length} phiếu khỏi kỳ?`,
        message: `Phiếu của ${losing.map((row) => row.name).join(", ")} đã có dữ liệu tự chấm và sẽ bị xóa vĩnh viễn. Giáo viên sẽ nhận thông báo không thuộc diện đánh giá kỳ này.`,
        confirmText: "Gỡ phiếu",
      });
      if (!ok) return;
    }
    setSaving(true);
    setError("");
    try {
      const body = { self_due_on: form.self_due_on || null, unit_due_on: form.unit_due_on || null, teacher_ids: [...selected] };
      const result = editing
        ? await apiJson(`/api/evaluation-periods/${dialog.period.id}`, { method: "PUT", body })
        : await apiJson("/api/evaluation-periods", { method: "POST", body: { ...body, year: Number(form.year), month: Number(form.month) } });
      onSaved(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const changeSummary = editing ? [added.length && `+${added.length} phiếu`, removed.length && `−${removed.length} phiếu`].filter(Boolean).join(", ") : "";

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ev-dialog ev-period-dialog" onSubmit={submit}>
        <h3>{editing ? `Sửa kỳ ${dialog.period.label}` : "Mở kỳ đánh giá tháng"}</h3>
        <nav className="ev-tabs small" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "setup"} className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>
            <Settings2 size={15} /> Thiết lập
          </button>
          <button type="button" role="tab" aria-selected={tab === "people"} className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}>
            <Users size={15} /> Nhân sự {roster && <em>{selected.size}</em>}
          </button>
        </nav>

        {tab === "setup" ? (
          <div className="ev-dialog-body">
            {!editing && (
              <div className="ev-dialog-row">
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
              </div>
            )}
            <div className="ev-dialog-row">
              <label>
                Hạn tự chấm
                <input type="date" value={form.self_due_on} onChange={(e) => setForm({ ...form, self_due_on: e.target.value })} />
              </label>
              <label>
                Hạn tổ chấm
                <input type="date" value={form.unit_due_on} onChange={(e) => setForm({ ...form, unit_due_on: e.target.value })} />
              </label>
            </div>
            <div className="ev-template-line">
              <ListChecks size={16} />
              <span>
                {editing ? "Bộ tiêu chí của kỳ: " : "Bộ tiêu chí áp dụng: "}
                <b>{roster?.template?.name ?? "—"}</b>
                {!editing && <small>Muốn dùng bộ khác, hãy áp dụng bộ đó trong màn <Link to="/evaluations/templates">Bộ tiêu chí</Link> trước khi mở kỳ.</small>}
              </span>
            </div>
            <button type="button" className="ev-people-summary" onClick={() => setTab("people")}>
              <Users size={16} />
              <span>
                {roster ? <><b>{selected.size}</b> giáo viên có phiếu{changeSummary && ` (${changeSummary})`}</> : "Đang tải danh sách nhân sự..."}
                <small>Xem và chọn người tham gia ở tab Nhân sự</small>
              </span>
            </button>
          </div>
        ) : (
          <div className="ev-dialog-body ev-roster">
            <label className="ev-search">
              <Search size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc mã giáo viên..." />
            </label>
            <div className="ev-roster-list">
              {!roster && <p className="ev-muted">Đang tải...</p>}
              {groups.map(([unit, members]) => {
                const pickable = members.filter(selectable);
                const allOn = pickable.length > 0 && pickable.every((row) => selected.has(row.teacher_id));
                return (
                  <section key={unit}>
                    <header>
                      <label>
                        <input type="checkbox" checked={allOn} disabled={!pickable.length} onChange={(e) => toggleGroup(members, e.target.checked)} />
                        <b>{unit}</b>
                      </label>
                      <small>{members.filter((row) => selected.has(row.teacher_id)).length}/{members.length}</small>
                    </header>
                    {members.map((row) => (
                      <RosterRow key={row.teacher_id} row={row} checked={selected.has(row.teacher_id)} disabled={!selectable(row)} onToggle={() => toggle(row)} />
                    ))}
                  </section>
                );
              })}
              {excluded.length > 0 && (
                <section className="excluded">
                  <header><b>Không thuộc diện đánh giá</b><small>{excluded.length}</small></header>
                  <p className="ev-dialog-note">Muốn đánh giá những người này, hãy cập nhật hồ sơ ở màn Quản lý nhân sự trước.</p>
                  {excluded.map((row) => <RosterRow key={row.teacher_id} row={row} checked={false} disabled onToggle={() => {}} />)}
                </section>
              )}
            </div>
          </div>
        )}

        {error && <p className="dl-dialog-error">{error}</p>}
        <footer>
          <span className="ev-dialog-count">{roster ? `Đã chọn ${selected.size} giáo viên${changeSummary ? ` · ${changeSummary}` : ""}` : ""}</span>
          <button type="button" className="secondary-btn" onClick={onClose}>Hủy</button>
          <button className="primary-btn" disabled={saving || !roster || !selected.size}>
            {saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : `Mở kỳ (${selected.size} phiếu)`}
          </button>
        </footer>
      </form>
    </div>
  );
}

function RosterRow({ row, checked, disabled, onToggle }) {
  return (
    <label className={`ev-roster-row ${disabled ? "disabled" : ""}`} title={row.lock_reason ?? row.reason ?? undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
      <span className="ev-person">
        {row.avatar_url ? <img src={row.avatar_url} alt="" /> : <i>{row.name?.split(" ").at(-1)?.charAt(0)}</i>}
        <span>
          <b>{row.name}</b>
          <small>{[row.code, row.reason, row.lock_reason].filter(Boolean).join(" · ")}</small>
        </span>
      </span>
      {row.evaluation && (
        <span className="ev-roster-tags">
          <span className={`ev-chip ${STATUS_TONES[row.evaluation.status]}`}>{row.evaluation.status_label}</span>
          {row.evaluation.has_data && row.evaluation.status === "draft" && <span className="ev-chip orange">Có dữ liệu</span>}
        </span>
      )}
    </label>
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
