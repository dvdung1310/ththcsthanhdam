import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { AlignJustify, ArrowDown, ArrowUp, Award, Rows3, CalendarPlus, Check, CheckCircle2, ChevronRight, ClipboardList, Trash2, Megaphone, MessageSquare, RotateCcw, Search, Send, Settings2, TriangleAlert, X } from "lucide-react";
import { apiJson } from "./api";
import ActionMenu from "./ActionMenu";
import { useConfirm } from "./ConfirmDialog";
import TablePagination, { usePagination } from "./TablePagination";
import { STATUS_TONES, daysPast, formatDay, formatScore, gradeCode, gradeTone, schoolYearLabel, schoolYearOf } from "./evaluationUtils";
import Dropdown from "./Dropdown";
import EvaluationPeriodPicker from "./EvaluationPeriodPicker";
import UnitPicker from "./UnitPicker";
import InfoPopover from "./InfoPopover";
import useFitHeight from "./useFitHeight";
import "./Evaluation.css";
import Avatar from "./Avatar";

const STATUS_FILTERS = [
  ["", "Tất cả"],
  ["draft", "Chưa nộp"],
  ["submitted", "Đã nộp"],
  ["unit_scored", "Đã chấm"],
  ["published", "Đã công bố"],
];

const AUDIENCES = [
  ["teacher", "Giáo viên", "GV"],
  ["staff", "Nhân viên", "NV"],
  ["leadership", "Ban giám hiệu", "BGH"],
];
const AUDIENCE_SHORT = Object.fromEntries(AUDIENCES.map(([value, , short]) => [value, short]));

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

  const abilities = overview?.abilities ?? {};
  const canBoard = abilities.can_score || abilities.can_manage;
  const hasOwn = overview?.data.some((period) => period.my_evaluation);
  const tab = params.get("tab") === "board" && canBoard ? "board" : !hasOwn && canBoard ? "board" : "mine";
  const periodId = Number(params.get("period")) || overview?.data[0]?.id || null;
  const period = overview?.data.find((item) => item.id === periodId) ?? null;

  const today = new Date();
  const currentMissing = Boolean(overview) && !overview.data.some((item) => item.year === today.getFullYear() && item.month === today.getMonth() + 1);
  const openNew = (year, month) => navigate(`/evaluations/periods/new?year=${year}&month=${month}`);

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
    try {
      setBoard(await apiJson(`/api/evaluations?period_id=${periodId}`));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [periodId, tab]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    if (location.state?.message) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, []);
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);
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
    const ok = await confirm({ title: `Gửi kết quả dự kiến ${period.label}?`, message: "Người được đánh giá sẽ xem được điểm chấm và xếp loại dự kiến của mình, và có thể gửi giải trình trước khi công bố.", confirmText: "Gửi kết quả" });
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
        : "Sau khi công bố, phiếu bị khóa và người được đánh giá nhận thông báo kết quả.",
      confirmText: "Công bố",
    });
    if (ok) run(() => apiJson(`/api/evaluation-periods/${period.id}/publish`, { method: "POST" }));
  };
  const reopen = async () => {
    const ok = await confirm({ title: `Mở lại ${period.label}?`, message: "Kỳ chuyển về trạng thái chờ giải trình để điều chỉnh điểm. Cần công bố lại sau khi sửa.", confirmText: "Mở lại" });
    if (ok) run(() => apiJson(`/api/evaluation-periods/${period.id}/reopen`, { method: "POST" }));
  };

  const templateInfo = (
    <InfoPopover label="Bộ tiêu chí đang áp dụng">
      Bộ tiêu chí đang áp dụng:{" "}
      {abilities.can_manage && overview?.template ? (
        <Link to={`/evaluations/templates/${overview.template.id}`}><b>{overview.template.name}</b></Link>
      ) : (
        <b>{overview?.template?.name ?? "Chưa có"}</b>
      )}
    </InfoPopover>
  );

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
        <MySheets periods={overview.data} info={templateInfo} />
      ) : (
        <section className="ev-card">
          <div className={`ev-board-head compact ${overview.data.length ? "" : "empty"}`}>
            {overview.data.length > 0 && (
              <EvaluationPeriodPicker
                periods={overview.data}
                value={periodId}
                canManage={abilities.can_manage}
                onChange={(id) => setParam({ period: String(id), status: "", flag: "" })}
                onOpenNew={openNew}
              />
            )}
            {period && (
              <div className="ev-period-flow">
                <PeriodSteps status={period.status} />
                <div className="ev-period-meta">
                  <DueDate label="Tự chấm" due={period.self_due_on} active={period.status === "open"} />
                  <DueDate label="Chấm" due={period.unit_due_on} active={period.status === "open"} />
                </div>
              </div>
            )}
            <div className="ev-period-actions">
              {templateInfo}
              {abilities.can_manage && (
                currentMissing ? (
                  <button className="primary-btn" onClick={() => openNew(today.getFullYear(), today.getMonth() + 1)}>
                    <CalendarPlus size={15} /> Mở kỳ Tháng {today.getMonth() + 1}/{today.getFullYear()}
                  </button>
                ) : (
                  <button className="secondary-btn icon-only" onClick={() => navigate("/evaluations/periods/new")} title="Mở kỳ đánh giá mới (tháng tiếp theo chưa mở)" aria-label="Mở kỳ đánh giá mới">
                    <CalendarPlus size={16} />
                  </button>
                )
              )}
              {period && abilities.can_manage && (
                <>
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
                </>
              )}
            </div>
          </div>

          {!period ? (
            <div className="empty-state">
              <CalendarPlus size={34} />
              <b>Chưa có kỳ đánh giá nào</b>
              {abilities.can_manage && <span>Bấm “Mở kỳ đánh giá” để tạo phiếu cho nhân sự.</span>}
            </div>
          ) : (
            <BoardSection board={board?.period?.id === period.id ? board : null} period={period} params={params} setParam={setParam} onOpen={(id) => navigate(`/evaluations/${id}`)} />
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
      {label} <b title={formatDay(due)}>{due ? `${String(new Date(due).getDate()).padStart(2, "0")}/${String(new Date(due).getMonth() + 1).padStart(2, "0")}` : "—"}</b>
      {due && past !== null && (past > 0 ? <em className="ev-due late">quá {past} ngày</em> : past >= -3 && <em className="ev-due soon">{past === 0 ? "hôm nay" : `còn ${-past} ngày`}</em>)}
    </span>
  );
}

function deadlineNote(row, period) {
  if (period.status === "open") {
    const selfPast = daysPast(period.self_due_on);
    const unitPast = daysPast(period.unit_due_on);
    if (row.status === "draft" && period.self_due_on && selfPast > 0) return { tone: "late", text: `Trễ hạn ${selfPast} ngày` };
    if (row.status === "submitted" && period.unit_due_on && unitPast > 0) return { tone: "late", text: `Chấm trễ ${unitPast} ngày` };
  }
  if (row.submitted_at && period.self_due_on && daysPast(period.self_due_on, row.submitted_at) > 0) return { tone: "warn", text: "Nộp sau hạn" };
  return null;
}

function MySheets({ periods, info }) {
  const own = periods.filter((period) => period.my_evaluation);
  const years = [...new Set(own.map((period) => schoolYearOf(period.year, period.month)))].sort((a, b) => b - a);
  const [year, setYear] = useState(null);
  const activeYear = years.includes(year) ? year : years[0];
  const rows = own.filter((period) => schoolYearOf(period.year, period.month) === activeYear);
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
      <YearHistory rows={rows} years={years} year={activeYear} info={info} onYear={(value) => { setYear(value); pager.reset(); }} />
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

function YearHistory({ rows, years, year, info, onYear }) {
  const published = [...rows].filter((period) => period.status === "published" && period.my_evaluation.total_score != null).sort((a, b) => a.year - b.year || a.month - b.month);
  const counts = {};
  published.forEach((period) => {
    const grade = period.my_evaluation.grade ?? "Không xếp loại";
    counts[grade] = (counts[grade] ?? 0) + 1;
  });
  const totals = published.map((period) => Number(period.my_evaluation.total_score));
  const average = totals.length ? Math.round((totals.reduce((sum, value) => sum + value, 0) / totals.length) * 100) / 100 : null;
  return (
    <div className="ev-history">
      <div className="ev-history-text">
        {years.length > 1 ? (
          <Dropdown label="Năm học" value={year} onChange={(value) => onYear(Number(value))} options={years.map((item) => ({ value: item, label: `Năm học ${schoolYearLabel(item)}` }))} />
        ) : (
          <b>Năm học {schoolYearLabel(year)}</b>
        )}
        {published.length ? (
          <span>
            {published.length} tháng đã công bố:{" "}
            {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([grade, count]) => `${count} ${grade}`).join(" · ")}
            {average != null && <> · Điểm TB <b>{formatScore(average)}</b></>}
          </span>
        ) : (
          <span className="ev-muted">Chưa có tháng nào được công bố.</span>
        )}
      </div>
      {published.length > 1 && <Sparkline points={published.map((period) => ({ label: `T${period.month}`, value: Number(period.my_evaluation.total_score), max: period.my_evaluation.max_base, grade: period.my_evaluation.grade }))} />}
      {info}
    </div>
  );
}

function Sparkline({ points }) {
  const width = 220;
  const height = 44;
  const values = points.map((point) => point.value);
  const frame = Math.max(...points.map((point) => point.max ?? 0)) || Math.max(...values);
  const min = Math.min(...values, frame * 0.6);
  const max = Math.max(...values, frame);
  const x = (index) => 10 + (index * (width - 20)) / Math.max(1, points.length - 1);
  const y = (value) => 6 + (1 - (value - min) / Math.max(1, max - min)) * (height - 18);
  return (
    <svg className="ev-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tổng điểm theo tháng">
      <line x1="10" x2={width - 10} y1={y(frame)} y2={y(frame)} className="ref" />
      <polyline points={points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ")} />
      {points.map((point, index) => (
        <g key={point.label}>
          <circle cx={x(index)} cy={y(point.value)} r="3">
            <title>{`${point.label}: ${formatScore(point.value)} điểm${point.grade ? ` · ${point.grade}` : ""}`}</title>
          </circle>
          <text x={x(index)} y={height - 1}>{point.label}</text>
        </g>
      ))}
    </svg>
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

const ATTENTION_FILTERS = [
  ["late", "Trễ hạn"],
  ["gap", "Chênh lệch ≥ 2 điểm"],
  ["comments", "Có giải trình / trao đổi"],
  ["violation", "Có vi phạm"],
];
const STATUS_ORDER = { draft: 0, submitted: 1, unit_scored: 2, published: 3 };
const scoreGap = (row) => (row.self_total != null && row.unit_total != null ? Math.round((row.unit_total - row.self_total) * 100) / 100 : null);
const collator = new Intl.Collator("vi");
const givenName = (name) => (name ?? "").trim().split(/\s+/).at(-1);
const byName = (a, b) => collator.compare(givenName(a.teacher.name), givenName(b.teacher.name)) || collator.compare(a.teacher.name ?? "", b.teacher.name ?? "");
const SORTERS = {
  name: (a, b) => byName(a, b),
  team: (a, b) => collator.compare(a.team?.name ?? "￿", b.team?.name ?? "￿") || collator.compare(a.group?.name ?? "", b.group?.name ?? ""),
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
};
const SCORE_KEYS = {
  self: (row) => row.self_total,
  unit: (row) => row.unit_total,
  gap: (row) => (scoreGap(row) == null ? null : Math.abs(scoreGap(row))),
};

function sortRows(rows, key, descending) {
  const sign = descending ? -1 : 1;
  const value = SCORE_KEYS[key];
  return [...rows].sort((a, b) => {
    if (value) {
      const [x, y] = [value(a), value(b)];
      if (x == null || y == null) return (x == null) - (y == null) || byName(a, b);
      return sign * (x - y) || byName(a, b);
    }
    return sign * (SORTERS[key] ?? SORTERS.name)(a, b) || byName(a, b);
  });
}

function matchesAttention(row, flag, period) {
  if (flag === "late") return deadlineNote(row, period)?.tone === "late";
  if (flag === "gap") return Math.abs(scoreGap(row) ?? 0) >= 2;
  if (flag === "comments") return row.comments_count > 0;
  if (flag === "violation") return row.has_violation;
  return true;
}

function BoardSection({ board, period, params, setParam, onOpen }) {
  const status = params.get("status") ?? "";
  const team = Number(params.get("team")) || null;
  const group = Number(params.get("group")) || null;
  const flag = params.get("flag") ?? "";
  const homeroom = params.get("homeroom") ?? "";
  const audience = params.get("audience") ?? "";
  const search = params.get("q") ?? "";
  const sortParam = params.get("sort") ?? "name";
  const sortKey = sortParam.replace(/^-/, "");
  const descending = sortParam.startsWith("-");
  const rows = board?.data ?? null;
  const audiences = useMemo(() => AUDIENCES.filter(([value]) => rows?.some((row) => row.audience === value)), [rows]);
  const shownAudiences = audience ? [audience] : audiences.map(([value]) => value);
  const teacherOnly = shownAudiences.length === 1 && shownAudiences[0] === "teacher";
  const scorerLabel = shownAudiences.every((value) => value === "teacher") ? "Tổ chấm" : shownAudiences.every((value) => value !== "teacher") ? "BGH đánh giá" : "Điểm chấm";

  const teams = useMemo(() => {
    const map = new Map();
    rows?.forEach((row) => row.team && map.set(row.team.id, row.team.name));
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name));
  }, [rows]);
  const groups = useMemo(() => {
    const map = new Map();
    rows?.forEach((row) => row.group && map.set(row.group.id, { id: row.group.id, name: row.group.name, team_id: row.team?.id ?? null }));
    return [...map.values()].sort((a, b) => collator.compare(a.name, b.name));
  }, [rows]);

  const scoped = useMemo(() => {
    if (!rows) return null;
    const keyword = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!team || row.unit_ids.includes(team)) &&
        (!group || row.unit_ids.includes(group)) &&
        (!flag || matchesAttention(row, flag, period)) &&
        (!audience || row.audience === audience) &&
        (!homeroom || (row.audience === "teacher" && row.is_homeroom === (homeroom === "yes"))) &&
        (!keyword || `${row.teacher.name} ${row.teacher.code ?? ""}`.toLowerCase().includes(keyword)),
    );
  }, [rows, team, group, flag, homeroom, audience, search, period]);

  const counts = useMemo(() => {
    const result = { "": scoped?.length ?? 0 };
    scoped?.forEach((row) => (result[row.status] = (result[row.status] ?? 0) + 1));
    return result;
  }, [scoped]);

  const visible = useMemo(() => {
    if (!scoped) return null;
    return sortRows(scoped.filter((row) => !status || row.status === status), sortKey, descending);
  }, [scoped, status, sortKey, descending]);

  const pager = usePagination(visible ?? [], 20);
  const update = (values) => {
    pager.reset();
    setParam(values);
  };
  const sortBy = (key) => update({ sort: sortKey === key && !descending ? `-${key}` : key === "name" ? "" : key });

  const total = scoped?.length ?? 0;
  const submitted = scoped?.filter((row) => row.status !== "draft").length ?? 0;
  const scored = scoped?.filter((row) => row.status === "unit_scored" || row.status === "published").length ?? 0;
  const late = scoped?.filter((row) => deadlineNote(row, period)?.tone === "late").length ?? 0;
  const filtered = Boolean(team || group || flag || homeroom || audience || search);
  const [dense, setDense] = useState(() => localStorage.getItem("thanhdam_board_density") !== "comfortable");
  const setDensity = (value) => {
    localStorage.setItem("thanhdam_board_density", value ? "compact" : "comfortable");
    setDense(value);
  };
  const [wrapRef, footRef, tableHeight] = useFitHeight([visible ? "ready" : "loading", dense, board?.not_included?.length ?? 0]);

  const header = (key, label, className = "") => (
    <th key={key} className={`${className} sortable ${sortKey === key ? "sorted" : ""}`} onClick={() => sortBy(key)} aria-sort={sortKey === key ? (descending ? "descending" : "ascending") : "none"}>
      {label}
      {sortKey === key && (descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
    </th>
  );

  return (
    <>
      <div className="ev-filters ev-board-chips">
        <div className="ev-status-chips">
          {STATUS_FILTERS.map(([value, label]) => (
            <button key={value} className={status === value ? "active" : ""} onClick={() => update({ status: value })}>
              {label} <em>{counts[value] ?? 0}</em>
            </button>
          ))}
          {late > 0 && (
            <button className={`late ${flag === "late" ? "active" : ""}`} onClick={() => update({ flag: flag === "late" ? "" : "late" })}>
              <TriangleAlert size={13} /> {late} trễ hạn
            </button>
          )}
        </div>
        {total > 0 && (
          <span className="ev-progress thin" aria-hidden="true" title={`Đã nộp ${submitted}/${total} · Đã chấm ${scored}/${total}`}>
            <i className="scored" style={{ width: `${(scored / total) * 100}%` }} />
            <i className="submitted" style={{ width: `${((submitted - scored) / total) * 100}%` }} />
          </span>
        )}
      </div>
      <div className="ev-filters ev-board-filters ev-summary-toolbar">
        <label className="ev-search">
          <Search size={15} />
          <input value={search} onChange={(e) => update({ q: e.target.value })} placeholder="Tìm tên hoặc mã nhân sự..." />
        </label>
        {audiences.length > 1 && (
          <div className="ev-segmented" role="group" aria-label="Đối tượng">
            {[["", "Tất cả"], ...audiences.map(([value, , short]) => [value, short])].map(([value, label]) => (
              <button key={value} type="button" className={audience === value ? "active" : ""} onClick={() => update({ audience: value, ...(value && value !== "teacher" ? { homeroom: "" } : {}) })}>{label}</button>
            ))}
          </div>
        )}
        {teams.length > 1 && <UnitPicker teams={teams} groups={groups} team={team} group={group} onChange={(next) => update(next)} />}
        {(teacherOnly || (!audience && audiences.some(([value]) => value === "teacher"))) && (
          <div className="ev-segmented" role="group" aria-label="Chủ nhiệm">
            {[["", "Tất cả"], ["yes", "Chủ nhiệm"], ["no", "Không CN"]].map(([value, label]) => (
              <button key={value} type="button" className={homeroom === value ? "active" : ""} onClick={() => update({ homeroom: value })}>{label}</button>
            ))}
          </div>
        )}
        <Dropdown
          label="Cần chú ý"
          icon={TriangleAlert}
          className={flag ? "picked" : ""}
          value={flag}
          onChange={(value) => update({ flag: String(value) })}
          options={[{ value: "", label: "Cần chú ý: tất cả" }, { divider: true }, ...ATTENTION_FILTERS.map(([value, label]) => ({ value, label }))]}
        />
        {filtered && <button className="ev-link-btn" onClick={() => update({ team: "", group: "", flag: "", homeroom: "", audience: "", q: "" })}>Xóa bộ lọc</button>}
      </div>

      {!visible ? (
        <div className="empty-state"><Award className="loading-icon" size={30} /><b>Đang tải...</b></div>
      ) : !visible.length ? (
        <div className="empty-state"><Search size={30} /><b>Không có phiếu phù hợp</b></div>
      ) : (
        <div ref={wrapRef} className="ev-table-wrap ev-board-wrap ev-summary-wrap" style={tableHeight ? { maxHeight: tableHeight } : undefined}>
          <table className={`ev-table ev-board-table ev-summary-grid ${dense ? "dense" : ""}`}>
            <thead>
              <tr>
                {header("name", teacherOnly ? "Giáo viên" : "Nhân sự", "sticky")}
                {header("team", "Tổ / nhóm")}
                {header("status", "Trạng thái")}
                {header("self", "Tự chấm", "num")}
                {header("unit", scorerLabel, "num")}
                {header("gap", "Chênh lệch", "num")}
                <th>Xếp loại</th>
                <th aria-label="Giải trình" />
                <th aria-label="Mở" />
              </tr>
            </thead>
            <tbody>
              {pager.rows.map((row) => {
                const note = deadlineNote(row, period);
                return (
                  <tr key={row.id} className="clickable" onClick={() => onOpen(row.id)}>
                    <td className="sticky">
                      <span className="ev-person">
                        {row.teacher.avatar_url ? <img src={row.teacher.avatar_url} alt="" /> : <Avatar name={row.teacher.name} />}
                        <span>
                          <b>{row.teacher.name}</b>
                          <small>{row.teacher.code}{row.is_homeroom && <em className="ev-tag">GVCN</em>}{row.audience !== "teacher" && <em className="ev-tag audience">{AUDIENCE_SHORT[row.audience]}</em>}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      {row.team ? row.team.name : <span className="ev-muted">Chưa thuộc tổ</span>}
                      {row.group && <small className="ev-sub">{row.group.name}</small>}
                    </td>
                    <td>
                      <span className={`ev-chip ${STATUS_TONES[row.status]}`}>{row.status_label}</span>
                      {note && <small className={note.tone === "late" ? "ev-late" : "ev-warn"}>{note.text}</small>}
                      {!dense && row.assigned_scorers?.length > 0 && <small className="ev-sub" title="Người chấm được chỉ định riêng">Chấm: {row.assigned_scorers.join(", ")}</small>}
                    </td>
                    <td className="num">{formatScore(row.self_total)}</td>
                    <td className="num">{row.unit_in_progress ? <span className="ev-muted">Đang chấm</span> : formatScore(row.unit_total)}</td>
                    <td className="num"><ScoreDiff self={row.self_total} unit={row.unit_total} /></td>
                    <td>
                      {dense ? (
                        <GradeTag row={row} />
                      ) : row.no_grade_reason ? (
                        <span className="ev-chip red">Không xếp loại</span>
                      ) : row.grade || (row.reviewed && row.suggested_grade) ? (
                        <b>{row.grade ?? row.suggested_grade}</b>
                      ) : row.suggested_grade ? (
                        <span className="ev-muted">Gợi ý: {row.suggested_grade}</span>
                      ) : (
                        <span className="ev-muted">—</span>
                      )}
                      {!dense && row.reviewed && <small className="ev-approved"><Check size={11} /> HT đã duyệt</small>}
                      {!dense && row.has_violation && <small className="ev-late">Có vi phạm</small>}
                    </td>
                    <td className="ev-comments">{row.comments_count > 0 && <span title="Trao đổi / giải trình"><MessageSquare size={14} /> {row.comments_count}</span>}</td>
                    <td className="ev-row-arrow"><ChevronRight size={18} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div ref={footRef} className="ev-summary-foot">
        <span className="ev-summary-stats" title={`Đã nộp ${submitted}/${total} · Đã chấm ${scored}/${total}`}>
          <b>{visible?.length ?? 0}</b> phiếu · Đã nộp <b>{submitted}/{total}</b> · Đã chấm <b>{scored}/{total}</b>
          {late > 0 && <> · <b className="ev-text-red">{late}</b> trễ hạn</>}
          {board?.not_included?.length > 0 && <span className="ev-muted" title={board.not_included.join(", ")}> · {board.not_included.length} người không tham gia kỳ này</span>}
        </span>
        <div className="ev-summary-foot-tools">
          <div className="ev-segmented small" role="group" aria-label="Mật độ">
            <button type="button" className={dense ? "active" : ""} title="Gọn" onClick={() => setDensity(true)}><AlignJustify size={14} /></button>
            <button type="button" className={!dense ? "active" : ""} title="Thoải mái" onClick={() => setDensity(false)}><Rows3 size={14} /></button>
          </div>
          <TablePagination pager={pager} noun="phiếu" sizes={[20, 50, 100]} showRange={false} />
        </div>
      </div>
    </>
  );
}

function GradeTag({ row }) {
  if (row.no_grade_reason) return <span className="ev-chip red" title={row.no_grade_reason}>KXL</span>;
  const label = row.grade ?? row.suggested_grade;
  if (!label) return <span className="ev-muted">—</span>;
  const final = Boolean(row.grade || row.reviewed);
  return (
    <span className="ev-grade-tag" title={`${final ? "" : "Gợi ý: "}${label}${row.reviewed ? " · Hiệu trưởng đã duyệt" : ""}${row.has_violation ? " · Có vi phạm" : ""}`}>
      <span className={`ev-chip ${gradeTone(label)} ${final ? "" : "suggested"}`}>{gradeCode(label)}</span>
      {row.reviewed && <Check size={12} className="ev-approved-icon" />}
      {!final && <small className="ev-muted">gợi ý</small>}
      {row.has_violation && <small className="ev-text-red">VP</small>}
    </span>
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
              Kỳ có {sheets.length} phiếu. Toàn bộ phiếu, điểm, minh chứng và trao đổi của kỳ sẽ bị xóa; người có phiếu nhận thông báo kỳ đã được hủy. Sau đó có thể mở lại tháng này từ đầu.
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
