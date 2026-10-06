import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowDown, ArrowUp, BarChart3, FileSpreadsheet, Info, Printer, Search, TriangleAlert } from "lucide-react";
import { apiFetch, apiJson } from "./api";
import TablePagination, { usePagination } from "./TablePagination";
import { GRADE_TONES, formatPercent, formatScore } from "./evaluationUtils";
import "./Evaluation.css";
import Avatar from "./Avatar";

const collator = new Intl.Collator("vi");
const givenName = (name) => (name ?? "").trim().split(/\s+/).at(-1);
const byName = (a, b) => collator.compare(givenName(a.name), givenName(b.name)) || collator.compare(a.name ?? "", b.name ?? "");

function sortRows(rows, key, descending) {
  const sign = descending ? -1 : 1;
  const value = {
    team: null,
    no_grade: (row) => row.stats.no_grade,
    violations: (row) => row.stats.violations,
    average: (row) => row.stats.average_percent,
  }[key] ?? (key.startsWith("g") ? (row) => row.stats.counts[key] ?? 0 : null);
  return [...rows].sort((a, b) => {
    if (key === "team") {
      return sign * (collator.compare(a.team?.name ?? "￿", b.team?.name ?? "￿") || collator.compare(a.group?.name ?? "", b.group?.name ?? "")) || byName(a, b);
    }
    if (value) {
      const [x, y] = [value(a), value(b)];
      if (x == null || y == null) return (x == null) - (y == null) || byName(a, b);
      return sign * (x - y) || byName(a, b);
    }
    return sign * byName(a, b);
  });
}

export default function EvaluationSummary() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const year = params.get("year") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const team = Number(params.get("team")) || null;
  const group = Number(params.get("group")) || null;
  const search = params.get("q") ?? "";
  const sortParam = params.get("sort") ?? "name";
  const sortKey = sortParam.replace(/^-/, "");
  const descending = sortParam.startsWith("-");

  const setParam = (values) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(values).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      return next;
    }, { replace: true });

  useEffect(() => {
    const query = new URLSearchParams();
    if (year) query.set("school_year", year);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    apiJson(`/api/evaluation-summary?${query}`)
      .then((result) => {
        setSummary(result);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [year, from, to]);

  const rows = summary?.teachers ?? null;
  const teams = useMemo(() => {
    const map = new Map();
    rows?.forEach((row) => row.team && map.set(row.team.id, row.team.name));
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name));
  }, [rows]);
  const groups = useMemo(() => {
    const map = new Map();
    rows?.forEach((row) => row.group && row.team?.id === team && map.set(row.group.id, row.group.name));
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name));
  }, [rows, team]);

  const visible = useMemo(() => {
    if (!rows) return null;
    const keyword = search.trim().toLowerCase();
    const list = rows.filter(
      (row) =>
        (!team || row.unit_ids.includes(team)) &&
        (!group || row.unit_ids.includes(group)) &&
        (!keyword || `${row.name} ${row.code ?? ""}`.toLowerCase().includes(keyword)),
    );
    return sortRows(list, sortKey, descending);
  }, [rows, team, group, search, sortKey, descending]);

  const pager = usePagination(visible ?? [], 20);
  const update = (values) => {
    pager.reset();
    setParam(values);
  };
  const sortBy = (key) => update({ sort: sortKey === key && !descending ? `-${key}` : key === "name" ? "" : key });

  const exportExcel = async () => {
    setExporting(true);
    try {
      const query = new URLSearchParams({ school_year: String(summary.school_year) });
      [["from", from], ["to", to], ["team", team], ["group", group], ["q", search.trim()]].forEach(([key, value]) => value && query.set(key, value));
      const response = await apiFetch(`/api/evaluation-summary/export?${query}`);
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? "Không xuất được file Excel.");
      const name = /filename="?([^";]+)"?/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "tong-hop-thi-dua.xlsx";
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: name });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const periods = summary?.periods ?? [];
  const grades = summary?.grades ?? [];
  const yearPeriods = summary?.year_periods ?? periods;
  const officialCount = periods.filter((period) => period.official).length;
  const filtered = Boolean(team || group || search);

  const header = (key, label, className = "", title) => (
    <th className={`${className} sortable ${sortKey === key ? "sorted" : ""}`} title={title} onClick={() => sortBy(key)} aria-sort={sortKey === key ? (descending ? "descending" : "ascending") : "none"}>
      {label}
      {sortKey === key && (descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
    </th>
  );

  return (
    <div className="ev-page ev-summary-page">
      <section className="ev-hero">
        <p>
          Tổng hợp kết quả các tháng <b>đã công bố</b> để Hội đồng thi đua bình xét theo đợt và cuối năm. Hệ thống không tự xếp danh hiệu.
        </p>
        <div className="ev-hero-actions">
          <button className="secondary-btn" disabled={!visible?.length} onClick={() => window.print()}><Printer size={16} /> In bảng</button>
          <button className="primary-btn" disabled={!visible?.length || exporting} onClick={exportExcel}>
            <FileSpreadsheet size={16} /> {exporting ? "Đang xuất..." : "Xuất Excel"}
          </button>
        </div>
      </section>

      {error && <div className="api-error"><TriangleAlert size={16} />{error}<button onClick={() => setError("")}>Đóng</button></div>}

      <section className="ev-card">
        <div className="ev-filters ev-summary-range">
          <label className="ev-period-select">
            <span>Năm học</span>
            <select value={summary?.school_year ?? ""} onChange={(e) => update({ year: e.target.value, from: "", to: "" })}>
              {summary?.school_years.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="ev-period-select">
            <span>Từ</span>
            <select value={from} onChange={(e) => update({ from: e.target.value })}>
              <option value="">Đầu năm học</option>
              {yearPeriods.map((period) => <option key={period.key} value={period.key} disabled={to && period.key > to}>{period.label}</option>)}
            </select>
          </label>
          <label className="ev-period-select">
            <span>Đến</span>
            <select value={to} onChange={(e) => update({ to: e.target.value })}>
              <option value="">Mới nhất</option>
              {yearPeriods.map((period) => <option key={period.key} value={period.key} disabled={from && period.key < from}>{period.label}</option>)}
            </select>
          </label>
          {summary && (
            <span className="ev-summary-scope">
              {periods.length} tháng · <b>{officialCount}</b> đã công bố
            </span>
          )}
        </div>
        <div className="ev-filters ev-board-filters">
          {teams.length > 1 && (
            <select value={team ?? ""} onChange={(e) => update({ team: e.target.value, group: "" })} aria-label="Tổ">
              <option value="">Mọi tổ</option>
              {teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
          {team && groups.length > 0 && (
            <select value={group ?? ""} onChange={(e) => update({ group: e.target.value })} aria-label="Nhóm">
              <option value="">Mọi nhóm</option>
              {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
          {filtered && <button className="ev-link-btn" onClick={() => update({ team: "", group: "", q: "" })}>Xóa bộ lọc</button>}
          <label className="ev-search">
            <Search size={15} />
            <input value={search} onChange={(e) => update({ q: e.target.value })} placeholder="Tìm tên hoặc mã giáo viên..." />
          </label>
        </div>

        {summary?.mixed_grades && (
          <div className="ev-notice warn ev-summary-notice">
            <TriangleAlert size={14} /> Các tháng trong phạm vi dùng khung xếp loại khác nhau; những bậc không khớp được tách thành cột riêng.
          </div>
        )}

        {!visible ? (
          <div className="empty-state"><BarChart3 className="loading-icon" size={30} /><b>Đang tải...</b></div>
        ) : !periods.length ? (
          <div className="empty-state"><BarChart3 size={30} /><b>Chưa có kỳ đánh giá nào trong năm học này</b></div>
        ) : !visible.length ? (
          <div className="empty-state"><Search size={30} /><b>Không có giáo viên phù hợp</b></div>
        ) : (
          <div className="ev-table-wrap ev-summary-wrap">
            <table className="ev-table ev-summary-grid">
              <thead>
                <tr>
                  {header("name", "Giáo viên", "sticky")}
                  {header("team", "Tổ / nhóm")}
                  {periods.map((period) => (
                    <th key={period.id} className={`center ${period.official ? "" : "pending"}`} title={period.official ? period.full_label : `${period.full_label} — chưa công bố, không tính vào thống kê`}>
                      {period.label}
                      {!period.official && <small>chưa công bố</small>}
                    </th>
                  ))}
                  {grades.map((grade) => header(grade.key, grade.short, "num stat", grade.name))}
                  {header("no_grade", "KXL", "num stat", "Số tháng không xếp loại")}
                  {header("violations", "Vi phạm", "num stat", "Số tháng có vi phạm QCCM / đạo đức nhà giáo")}
                  {header("average", "TB", "num stat", "Điểm trung bình theo % điểm tối đa của khung (GVCN 100, không CN 80)")}
                </tr>
              </thead>
              <tbody>
                {pager.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="sticky">
                      <span className="ev-person">
                        {row.avatar_url ? <img src={row.avatar_url} alt="" /> : <Avatar name={row.name} />}
                        <span>
                          <b>{row.name}</b>
                          <small>{row.code}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      {row.team ? row.team.name : <span className="ev-muted">Chưa thuộc tổ</span>}
                      {row.group && <small className="ev-sub">{row.group.name}</small>}
                    </td>
                    {periods.map((period) => (
                      <td key={period.id} className="center">
                        <MonthCell cell={row.cells[period.id]} grades={grades} onOpen={(id) => navigate(`/evaluations/${id}`)} />
                      </td>
                    ))}
                    {grades.map((grade) => <td key={grade.key} className="num stat">{row.stats.counts[grade.key] || <span className="ev-muted">0</span>}</td>)}
                    <td className="num stat">{row.stats.no_grade ? <b className="ev-text-red">{row.stats.no_grade}</b> : <span className="ev-muted">0</span>}</td>
                    <td className="num stat">{row.stats.violations ? <b className="ev-text-red">{row.stats.violations}</b> : <span className="ev-muted">0</span>}</td>
                    <td className="num stat"><b>{formatPercent(row.stats.average_percent)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination pager={pager} noun="giáo viên" sizes={[20, 50, 100]} />
        <p className="ev-summary-legend">
          <Info size={13} /> Chỉ tính các tháng đã công bố. “—”: không có phiếu tháng đó · KXL: không xếp loại · TB: trung bình % điểm tối đa của khung, có thể vượt 100% nhờ điểm cộng.
        </p>
      </section>

      {summary && visible && <SummaryPrint summary={summary} rows={visible} />}
    </div>
  );
}

function MonthCell({ cell, grades, onOpen }) {
  if (!cell) return <span className="ev-muted">—</span>;
  if (!cell.official) {
    return <button type="button" className="ev-month-cell pending" onClick={() => onOpen(cell.evaluation_id)}>{cell.pending_label}</button>;
  }
  const index = grades.findIndex((grade) => grade.key === cell.grade_key);
  const noGrade = cell.no_grade_reason || index < 0;
  return (
    <button
      type="button"
      className="ev-month-cell"
      onClick={() => onOpen(cell.evaluation_id)}
      title={[noGrade ? `Không xếp loại${cell.no_grade_reason ? `: ${cell.no_grade_reason}` : ""}` : cell.grade_name, cell.has_violation ? "Có vi phạm" : null, cell.is_homeroom ? "GVCN" : null].filter(Boolean).join(" · ")}
    >
      <span className={`ev-chip ${noGrade ? "red" : GRADE_TONES[index]}`}>{noGrade ? "KXL" : grades[index].short}</span>
      <small>
        {formatScore(cell.total)}
        {cell.has_violation && <em className="ev-text-red"> · VP</em>}
      </small>
    </button>
  );
}

function SummaryPrint({ summary, rows }) {
  const { periods, grades } = summary;
  const cellText = (cell) => {
    if (!cell) return "—";
    if (!cell.official) return cell.pending_label;
    const index = grades.findIndex((grade) => grade.key === cell.grade_key);
    const grade = cell.no_grade_reason || index < 0 ? "KXL" : grades[index].short;
    return `${grade}${cell.total != null ? ` · ${formatScore(cell.total)}` : ""}${cell.has_violation ? " (VP)" : ""}`;
  };
  return (
    <div className="ev-print ev-print-summary">
      <div className="ev-print-head">
        <b>TRƯỜNG TH &amp; THCS THANH ĐÀM</b>
        <b>HỘI ĐỒNG THI ĐUA KHEN THƯỞNG</b>
      </div>
      <h1>BẢNG TỔNG HỢP KẾT QUẢ THI ĐUA HẰNG THÁNG</h1>
      <p className="center">{summary.range_label}</p>
      <table>
        <thead>
          <tr>
            <th style={{ width: "4%" }}>STT</th>
            <th style={{ width: "17%" }}>Họ và tên</th>
            <th style={{ width: "13%" }}>Tổ / nhóm</th>
            {periods.map((period) => <th key={period.id}>{period.label}{!period.official && <><br />(chưa công bố)</>}</th>)}
            {grades.map((grade) => <th key={grade.key}>{grade.short}</th>)}
            <th>KXL</th>
            <th>Vi phạm</th>
            <th>TB (%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td className="center">{index + 1}</td>
              <td>{row.name}</td>
              <td>{[row.team?.name, row.group?.name].filter(Boolean).join(" / ")}</td>
              {periods.map((period) => <td key={period.id} className="center">{cellText(row.cells[period.id])}</td>)}
              {grades.map((grade) => <td key={grade.key} className="center">{row.stats.counts[grade.key] ?? 0}</td>)}
              <td className="center">{row.stats.no_grade}</td>
              <td className="center">{row.stats.violations}</td>
              <td className="center">{row.stats.average_percent == null ? "" : formatScore(row.stats.average_percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ev-print-note">Chỉ tính các tháng đã công bố. KXL: không xếp loại; VP: có vi phạm; TB: trung bình % điểm tối đa của khung (GVCN 100, không CN 80).</p>
      <div className="ev-print-signs two">
        <div>
          <i aria-hidden="true">&nbsp;</i>
          <b>THƯ KÝ HỘI ĐỒNG</b>
          <span>(Ký, ghi rõ họ tên)</span>
        </div>
        <div>
          <i>Thanh Đàm, ngày …… tháng …… năm ……</i>
          <b>CHỦ TỊCH HỘI ĐỒNG</b>
          <span>(Ký, ghi rõ họ tên)</span>
        </div>
      </div>
    </div>
  );
}
