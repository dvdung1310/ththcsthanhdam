import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AlignJustify, ArrowDown, ArrowUp, BarChart3, Check, ChevronDown, Rows3, FileSpreadsheet, Info, Printer, Search, SlidersHorizontal, TriangleAlert, Users, X } from "lucide-react";
import { apiFetch, apiJson } from "./api";
import TablePagination, { usePagination } from "./TablePagination";
import { GRADE_TONES, formatScore } from "./evaluationUtils";
import { useOutsideClose } from "./PeoplePicker";
import "./Evaluation.css";
import Avatar from "./Avatar";

const collator = new Intl.Collator("vi");
const givenName = (name) => (name ?? "").trim().split(/\s+/).at(-1);
const byName = (a, b) => collator.compare(givenName(a.name), givenName(b.name)) || collator.compare(a.name ?? "", b.name ?? "");

const SERVER_FILTERS = ["homeroom", "grades", "gscope", "violation", "min", "max", "status", "top"];
const HOMEROOM = [["", "Tất cả"], ["yes", "Chủ nhiệm"], ["no", "Không CN"]];
const VIOLATION = [["", "Tất cả"], ["yes", "Có vi phạm"], ["no", "Không vi phạm"]];
const STATUS = [["", "Tất cả"], ["working", "Đang làm việc"], ["on_leave", "Nghỉ phép"], ["suspended", "Tạm nghỉ"]];
const TOPS = [["", "Tất cả"], ["3", "Top 3"], ["10", "Top 10"], ["20", "Top 20"]];
const MEDALS = { 1: "gold", 2: "silver", 3: "bronze" };

function gradeCode(label) {
  const text = (label ?? "").trim();
  if (/^xuất sắc$/i.test(text)) return "XS";
  const level = /^loại\s+(.+)$/i.exec(text);
  if (level) return level[1];
  return text.split(/\s+/).map((word) => word.charAt(0).toUpperCase()).join("") || text;
}

function sortRows(rows, key, descending) {
  const sign = descending ? -1 : 1;
  const value = {
    rank: (row) => row.rank,
    no_grade: (row) => row.stats.no_grade,
    violations: (row) => row.stats.violations,
    months: (row) => row.stats.months,
    average: (row) => row.stats.average,
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

function presetRange(preset, year, periods) {
  if (preset === "hk1") return { from: `${year}-08`, to: `${year}-12` };
  if (preset === "hk2") return { from: `${year + 1}-01`, to: `${year + 1}-05` };
  if (preset === "latest") {
    const last = periods.filter((period) => period.official).at(-1) ?? periods.at(-1);
    return last ? { from: last.key, to: last.key } : { from: "", to: "" };
  }
  return { from: "", to: "" };
}

export default function EvaluationSummary() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = () => setMoreOpen(false);
  const moreRef = useOutsideClose(moreOpen, closeMore);

  const year = params.get("year") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const team = Number(params.get("team")) || null;
  const group = Number(params.get("group")) || null;
  const search = params.get("q") ?? "";
  const homeroom = params.get("homeroom") ?? "";
  const gradeFilter = (params.get("grades") ?? "").split(",").filter(Boolean);
  const gradeScope = params.get("gscope") ?? "any";
  const violation = params.get("violation") ?? "";
  const min = params.get("min") ?? "";
  const max = params.get("max") ?? "";
  const status = params.get("status") ?? "";
  const top = params.get("top") ?? "";
  const sortParam = params.get("sort") ?? "rank";
  const sortKey = sortParam.replace(/^-/, "");
  const descending = sortParam.startsWith("-");
  const [keyword, setKeyword] = useState(search);
  const searchTimer = useRef(null);

  const setParam = (values) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(values).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      return next;
    }, { replace: true });

  const query = useMemo(() => {
    const result = new URLSearchParams();
    [["school_year", year], ["from", from], ["to", to], ["team", team], ["group", group], ["q", search.trim()], ["homeroom", homeroom],
      ["grades", gradeFilter.join(",")], ["grade_scope", gradeFilter.length ? gradeScope : ""], ["violation", violation], ["min", min], ["max", max], ["status", status], ["top", top]]
      .forEach(([key, value]) => value && result.set(key, String(value)));
    return result.toString();
  }, [year, from, to, team, group, search, homeroom, gradeFilter.join(","), gradeScope, violation, min, max, status, top]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiJson(`/api/evaluation-summary?${query}`)
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setError("");
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [query]);

  const rows = summary?.teachers ?? null;
  const teams = summary?.facets?.teams ?? [];
  const groups = (summary?.facets?.groups ?? []).filter((item) => item.team_id === team);
  const allYears = Boolean(summary?.all_years);
  const yearColumns = summary?.year_columns ?? [];
  const visible = useMemo(() => (rows ? sortRows(rows, sortKey, descending) : null), [rows, sortKey, descending]);

  const pager = usePagination(visible ?? [], 20);
  const [dense, setDense] = useState(() => localStorage.getItem("thanhdam_summary_density") !== "comfortable");
  const setDensity = (value) => {
    localStorage.setItem("thanhdam_summary_density", value ? "compact" : "comfortable");
    setDense(value);
  };
  const wrapRef = useRef(null);
  const footRef = useRef(null);
  const [tableHeight, setTableHeight] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const top = wrap.getBoundingClientRect().top + window.scrollY;
      const below = (footRef.current?.offsetHeight ?? 0) + 28;
      setTableHeight(Math.max(360, Math.floor(window.innerHeight - top - below)));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    if (wrapRef.current?.parentElement) observer.observe(wrapRef.current.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [visible ? "ready" : "loading", dense]);
  const update = (values) => {
    pager.reset();
    setParam(values);
  };
  const typeSearch = (value) => {
    setKeyword(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => update({ q: value }), 300);
  };
  const sortBy = (key) => update({ sort: sortKey === key && !descending ? `-${key}` : key === "rank" ? "" : key });

  const exportExcel = async () => {
    setExporting(true);
    try {
      const exportQuery = new URLSearchParams(query);
      exportQuery.set("school_year", String(summary.school_year));
      const response = await apiFetch(`/api/evaluation-summary/export?${exportQuery}`);
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
  const schoolYear = summary?.school_year;
  const yearStart = typeof schoolYear === "number" ? schoolYear : null;
  const activePreset = !from && !to ? "year" : ["hk1", "hk2", "latest"].find((preset) => {
    const range = presetRange(preset, yearStart, yearPeriods.map((period) => ({ ...period, official: periods.find((p) => p.key === period.key)?.official ?? true })));
    return range.from === from && range.to === to;
  });
  const gradeOptions = [...grades.map((grade, index) => ({ key: grade.key, label: grade.short, tone: GRADE_TONES[index] })), { key: "kxl", label: "KXL", tone: "red" }];
  const moreCount = [gradeFilter.length > 0, violation, min || max, status].filter(Boolean).length;

  const chips = [
    team && {
      key: "team",
      label: [teams.find((item) => item.id === team)?.name, group && groups.find((item) => item.id === group)?.name].filter(Boolean).join(" › "),
      clear: { team: "", group: "" },
    },
    homeroom && { key: "homeroom", label: homeroom === "yes" ? "Chủ nhiệm" : "Không chủ nhiệm", clear: { homeroom: "" } },
    gradeFilter.length > 0 && {
      key: "grades",
      label: `Xếp loại${gradeScope === "latest" ? " tháng gần nhất" : ""}: ${gradeFilter.map((key) => gradeOptions.find((option) => option.key === key)?.label ?? key).join(", ")}`,
      clear: { grades: "", gscope: "" },
    },
    violation && { key: "violation", label: violation === "yes" ? "Có vi phạm" : "Không vi phạm", clear: { violation: "" } },
    (min || max) && { key: "score", label: `Điểm TB ${min ? `≥ ${min}` : ""}${min && max ? " và " : ""}${max ? `≤ ${max}` : ""}`, clear: { min: "", max: "" } },
    status && { key: "status", label: STATUS.find(([value]) => value === status)?.[1], clear: { status: "" } },
    top && { key: "top", label: `Top ${top}`, clear: { top: "" } },
    search && { key: "q", label: `“${search}”`, clear: { q: "" } },
  ].filter(Boolean);
  const clearAll = () => {
    setKeyword("");
    update({ team: "", group: "", q: "", ...Object.fromEntries(SERVER_FILTERS.map((key) => [key, ""])) });
  };
  const toggleGrade = (key) => {
    const next = gradeFilter.includes(key) ? gradeFilter.filter((item) => item !== key) : [...gradeFilter, key];
    update({ grades: next.join(",") });
  };
  const overview = summary?.overview;

  const header = (key, label, className = "", title) => (
    <th key={key} className={`${className} sortable ${sortKey === key ? "sorted" : ""}`} title={title} onClick={() => sortBy(key)} aria-sort={sortKey === key ? (descending ? "descending" : "ascending") : "none"}>
      {label}
      {sortKey === key && (descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
    </th>
  );

  return (
    <div className="ev-page ev-summary-page">
      {error && <div className="api-error"><TriangleAlert size={16} />{error}<button onClick={() => setError("")}>Đóng</button></div>}

      <section className="ev-card">
        <div className="ev-filters ev-summary-range">
          <label className="ev-period-select">
            <span>Năm học</span>
            <select value={schoolYear ?? ""} onChange={(e) => update({ year: e.target.value, from: "", to: "" })}>
              <option value="all">Tất cả các năm</option>
              {summary?.school_years.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {!allYears && <div className="ev-segmented" role="group" aria-label="Khoảng thời gian">
            {[["year", "Cả năm"], ["hk1", "Học kỳ I"], ["hk2", "Học kỳ II"], ["latest", "Tháng gần nhất"]].map(([preset, label]) => (
              <button key={preset} type="button" className={activePreset === preset ? "active" : ""} disabled={!summary} onClick={() => update(presetRange(preset, yearStart, yearPeriods.map((period) => ({ ...period, official: periods.find((p) => p.key === period.key)?.official ?? true }))))}>
                {label}
              </button>
            ))}
          </div>}
          <label className="ev-period-select">
            <span>Từ</span>
            <select value={from} onChange={(e) => update({ from: e.target.value })}>
              <option value="">{allYears ? "Tháng đầu tiên" : "Đầu năm học"}</option>
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
          <div className="ev-summary-actions">
            <InfoPopover label="Giới thiệu bảng tổng hợp">
              Tổng hợp và xếp hạng kết quả các tháng <b>đã công bố</b> để Hội đồng thi đua tham khảo khi bình xét theo đợt và cuối năm. Hệ thống không tự xếp danh hiệu.
            </InfoPopover>
            <button className="secondary-btn icon-only" disabled={!visible?.length} onClick={() => window.print()} title="In bảng" aria-label="In bảng"><Printer size={16} /></button>
            <button className="primary-btn" disabled={!visible?.length || exporting} onClick={exportExcel} title="Xuất Excel theo bộ lọc">
              <FileSpreadsheet size={16} /> {exporting ? "Đang xuất..." : "Excel"}
            </button>
          </div>
        </div>

        <div className="ev-filters ev-summary-toolbar">
          <label className="ev-search">
            <Search size={15} />
            <input value={keyword} onChange={(e) => typeSearch(e.target.value)} placeholder="Tìm tên hoặc mã giáo viên..." />
          </label>
          <UnitPicker teams={teams} groups={summary?.facets?.groups ?? []} team={team} group={group} onChange={(next) => update(next)} />
          <div className="ev-segmented" role="group" aria-label="Chủ nhiệm">
            {HOMEROOM.map(([value, label]) => (
              <button key={value} type="button" className={homeroom === value ? "active" : ""} onClick={() => update({ homeroom: value })}>{label}</button>
            ))}
          </div>
          <div className="ev-more" ref={moreRef}>
            <button type="button" className={`ev-more-btn ${moreOpen || moreCount ? "active" : ""}`} data-picker-trigger aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
              <SlidersHorizontal size={15} /> Bộ lọc khác {moreCount > 0 && <em>{moreCount}</em>}
            </button>
            {moreOpen && (
              <div className="ev-more-panel" data-picker-panel role="dialog" aria-label="Bộ lọc khác">
                <header>
                  <b>Bộ lọc khác</b>
                  <button type="button" onClick={closeMore} aria-label="Đóng"><X size={16} /></button>
                </header>
                <fieldset>
                  <legend>Xếp loại</legend>
                  <div className="ev-more-chips">
                    {gradeOptions.map((option) => (
                      <button key={option.key} type="button" className={`ev-chip ${option.tone} ${gradeFilter.includes(option.key) ? "picked" : ""}`} onClick={() => toggleGrade(option.key)}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="ev-segmented small">
                    {[["any", "Có ít nhất 1 tháng"], ["latest", "Tháng gần nhất"]].map(([value, label]) => (
                      <button key={value} type="button" className={gradeScope === value ? "active" : ""} onClick={() => update({ gscope: value === "any" ? "" : value })}>{label}</button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Vi phạm</legend>
                  <div className="ev-segmented small">
                    {VIOLATION.map(([value, label]) => (
                      <button key={value} type="button" className={violation === value ? "active" : ""} onClick={() => update({ violation: value })}>{label}</button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Điểm trung bình</legend>
                  <div className="ev-range-inputs">
                    <input type="number" inputMode="decimal" value={min} placeholder="Từ" onChange={(e) => update({ min: e.target.value })} aria-label="Điểm từ" />
                    <span>—</span>
                    <input type="number" inputMode="decimal" value={max} placeholder="Đến" onChange={(e) => update({ max: e.target.value })} aria-label="Điểm đến" />
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Trạng thái công tác</legend>
                  <div className="ev-segmented small">
                    {STATUS.map(([value, label]) => (
                      <button key={value} type="button" className={status === value ? "active" : ""} onClick={() => update({ status: value })}>{label}</button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
          </div>
          <select value={top} onChange={(e) => update({ top: e.target.value })} aria-label="Giới hạn" className="ev-top-select">
            {TOPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {chips.length > 0 && (
          <div className="ev-active-filters">
            <span>Đang lọc:</span>
            {chips.map((chip) => (
              <button key={chip.key} type="button" onClick={() => {
                if (chip.key === "q") setKeyword("");
                update(chip.clear);
              }}>
                {chip.label} <X size={12} />
              </button>
            ))}
            <button type="button" className="ev-link-btn" onClick={clearAll}>Xóa tất cả</button>
          </div>
        )}

        {allYears && summary?.mixed_scale && (
          <div className="ev-notice warn ev-summary-notice">
            <TriangleAlert size={14} /> Các năm học dùng thang điểm khác nhau, điểm trung bình giữa các năm chỉ nên so sánh tương đối.
          </div>
        )}

        {summary?.mixed_grades && (
          <div className="ev-notice warn ev-summary-notice">
            <TriangleAlert size={14} /> Các tháng trong phạm vi dùng khung xếp loại khác nhau; những bậc không khớp được tách thành cột riêng.
          </div>
        )}

        {!visible ? (
          <div className="empty-state"><BarChart3 className="loading-icon" size={30} /><b>Đang tải...</b></div>
        ) : !periods.length ? (
          <div className="empty-state"><BarChart3 size={30} /><b>Chưa có kỳ đánh giá nào trong khoảng này</b></div>
        ) : !visible.length ? (
          <div className="empty-state"><Search size={30} /><b>Không có giáo viên phù hợp</b></div>
        ) : (
          <div ref={wrapRef} className={`ev-table-wrap ev-summary-wrap ${loading ? "loading" : ""}`} style={tableHeight ? { maxHeight: tableHeight } : undefined}>
            <table className={`ev-table ev-summary-grid ${dense ? "dense" : ""}`}>
              <thead>
                <tr>
                  {header("rank", "Hạng", "center rank-col")}
                  {header("name", "Giáo viên", "sticky")}
                  {header("team", "Tổ / nhóm")}
                  {allYears
                    ? yearColumns.map((column) => (
                        <th key={column.value} className="center" title={`${column.official}/${column.months} tháng đã công bố`}>
                          {column.label}
                          <small>{column.official} tháng công bố</small>
                        </th>
                      ))
                    : periods.map((period) => (
                        <th key={period.id} className={`center ${period.official ? "" : "pending"}`} title={period.official ? period.full_label : `${period.full_label} — chưa công bố, không tính vào thống kê`}>
                          {period.label}
                          {!period.official && <small>chưa công bố</small>}
                        </th>
                      ))}
                  {grades.map((grade) => header(grade.key, dense ? gradeCode(grade.short) : grade.short, "num stat", `Số tháng ${grade.name}`))}
                  {header("no_grade", "KXL", "num stat", "Số tháng không xếp loại")}
                  {header("violations", "Vi phạm", "num stat", "Số tháng có vi phạm QCCM / đạo đức nhà giáo")}
                  {header("months", "Số tháng", "num stat", "Số tháng đã công bố có điểm")}
                  {header("average", "Điểm TB", "num stat", "Trung bình tổng điểm các tháng được chấm")}
                </tr>
              </thead>
              <tbody>
                {pager.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="center rank-col">
                      <RankBadge row={row} />
                    </td>
                    <td className="sticky">
                      <span className="ev-person">
                        {row.avatar_url ? <img src={row.avatar_url} alt="" /> : <Avatar name={row.name} />}
                        <span>
                          {dense ? (
                            <>
                              <b>{row.name}</b>
                              <small>{row.code}{row.is_homeroom && <em className="ev-tag">GVCN</em>}</small>
                            </>
                          ) : (
                            <>
                              <b>{row.name}{row.is_homeroom && <em className="ev-tag">GVCN</em>}</b>
                              <small>{row.code}</small>
                            </>
                          )}
                        </span>
                      </span>
                    </td>
                    <td>
                      {row.team ? row.team.name : <span className="ev-muted">Chưa thuộc tổ</span>}
                      {row.group && <small className="ev-sub">{row.group.name}</small>}
                    </td>
                    {allYears
                      ? yearColumns.map((column) => (
                          <td key={column.value} className="center">
                            <YearCell value={row.years?.[column.value]} onOpen={() => update({ year: String(column.value), from: "", to: "" })} />
                          </td>
                        ))
                      : periods.map((period) => (
                          <td key={period.id} className="center">
                            <MonthCell cell={row.cells[period.id]} grades={grades} frame={homeroom} dense={dense} onOpen={(id) => navigate(`/evaluations/${id}`)} />
                          </td>
                        ))}
                    {grades.map((grade) => <td key={grade.key} className="num stat">{row.stats.counts[grade.key] || <span className="ev-muted">0</span>}</td>)}
                    <td className="num stat">{row.stats.no_grade ? <b className="ev-text-red">{row.stats.no_grade}</b> : <span className="ev-muted">0</span>}</td>
                    <td className="num stat">{row.stats.violations ? <b className="ev-text-red">{row.stats.violations}</b> : <span className="ev-muted">0</span>}</td>
                    <td className="num stat">{row.stats.months}<span className="ev-muted">/{officialCount}</span></td>
                    <td className="num stat"><b>{formatScore(row.stats.average)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div ref={footRef} className="ev-summary-foot">
          {overview && (
            <span className="ev-summary-stats" title={`${overview.teachers} giáo viên · Điểm TB ${formatScore(overview.average)} · ${overview.top_grade_teachers} có tháng ${overview.top_grade ?? ""} · ${overview.violation_teachers} có vi phạm · ${overview.unscored} chưa có điểm · ${officialCount}/${periods.length} tháng đã công bố`}>
              <b>{overview.teachers}</b> GV · TB <b>{formatScore(overview.average)}</b> · <b>{overview.top_grade_teachers}</b> có {overview.top_grade ?? "hạng cao"} ·{" "}
              <b className={overview.violation_teachers ? "ev-text-red" : ""}>{overview.violation_teachers}</b> vi phạm · <b>{overview.unscored}</b> chưa chấm
              <span className="ev-muted"> · {allYears ? `${yearColumns.length} năm học, ` : ""}{officialCount}/{periods.length} tháng đã công bố</span>
            </span>
          )}
          <div className="ev-summary-foot-tools">
            <div className="ev-segmented small" role="group" aria-label="Mật độ">
              <button type="button" className={dense ? "active" : ""} title="Gọn" onClick={() => setDensity(true)}><AlignJustify size={14} /></button>
              <button type="button" className={!dense ? "active" : ""} title="Thoải mái" onClick={() => setDensity(false)}><Rows3 size={14} /></button>
            </div>
            <InfoPopover label="Cách tính" text="Cách tính" up>
              Chỉ tính các tháng đã công bố{homeroom ? (homeroom === "yes" ? ", và chỉ các tháng chủ nhiệm" : ", và chỉ các tháng không chủ nhiệm") : ""}. <b>Điểm TB</b> là trung bình tổng điểm các tháng được chấm, không quy đổi giữa khung chủ nhiệm và không chủ nhiệm.
              <br />
              <b>Hạng</b> xét Điểm TB, rồi số tháng xếp loại cao nhất, rồi số tháng xếp loại kế tiếp, rồi ít vi phạm; bằng nhau thì đồng hạng. Hạng tính trong phạm vi tổ, nhóm và khung chủ nhiệm đang chọn; các bộ lọc khác chỉ thu hẹp danh sách.
              <br />
              “—”: không có phiếu tháng đó · KXL: không xếp loại · ⚠: có tháng vi phạm hoặc không xếp loại.
            </InfoPopover>
            <TablePagination pager={pager} noun="giáo viên" sizes={[20, 50, 100]} showRange={false} />
          </div>
        </div>
      </section>

      {summary && visible && <SummaryPrint summary={summary} rows={visible} homeroom={homeroom} />}
    </div>
  );
}

const fold = (text) => (text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

function UnitPicker({ teams, groups, team, group, onChange }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => !ref.current?.contains(event.target) && setOpen(false);
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const query = fold(term.trim());
  const tree = teams
    .map((item) => {
      const children = groups.filter((child) => child.team_id === item.id);
      const selfHit = !query || fold(item.name).includes(query);
      const hits = selfHit ? children : children.filter((child) => fold(child.name).includes(query));
      return { ...item, children: hits, visible: selfHit || hits.length > 0 };
    })
    .filter((item) => item.visible);
  const label = group ? groups.find((item) => item.id === group)?.name : team ? teams.find((item) => item.id === team)?.name : "Mọi tổ / nhóm";
  const pick = (next) => {
    onChange(next);
    setOpen(false);
    setTerm("");
  };
  return (
    <div className="ev-unit-picker" ref={ref}>
      <button type="button" className={`ev-more-btn ${team ? "active" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Users size={15} /> <span>{label}</span> <ChevronDown size={14} />
      </button>
      {open && (
        <div className="ev-unit-panel" role="listbox" aria-label="Tổ / nhóm">
          <label className="ev-search">
            <Search size={15} />
            <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Tìm tổ hoặc nhóm..." />
          </label>
          <div className="ev-unit-list">
            {!query && (
              <button type="button" className={!team ? "selected" : ""} onClick={() => pick({ team: "", group: "" })}>
                <span>Mọi tổ / nhóm</span>
                {!team && <Check size={14} />}
              </button>
            )}
            {tree.map((item) => (
              <div key={item.id}>
                <button type="button" className={`unit ${team === item.id && !group ? "selected" : ""}`} onClick={() => pick({ team: String(item.id), group: "" })}>
                  <span>{item.name}</span>
                  {team === item.id && !group && <Check size={14} />}
                </button>
                {item.children.map((child) => (
                  <button key={child.id} type="button" className={`child ${group === child.id ? "selected" : ""}`} onClick={() => pick({ team: String(item.id), group: String(child.id) })}>
                    <span>{child.name}</span>
                    {group === child.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            ))}
            {!tree.length && <p className="ev-muted">Không tìm thấy tổ hoặc nhóm.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoPopover({ label, text, up = false, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => !ref.current?.contains(event.target) && setOpen(false);
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <span className="ev-info-pop" ref={ref}>
      <button type="button" className={`ev-info-btn ${open ? "active" : ""}`} aria-label={label} aria-expanded={open} title={label} onClick={() => setOpen(!open)}>
        <Info size={15} />
        {text && <span>{text}</span>}
      </button>
      {open && <div className={`ev-info-panel ${up ? "up" : ""}`} role="dialog" aria-label={label}>{children}</div>}
    </span>
  );
}

function YearCell({ value, onOpen }) {
  if (!value) return <span className="ev-muted">—</span>;
  return (
    <button type="button" className="ev-month-cell" onClick={onOpen} title="Xem bảng của năm học này">
      <b className="ev-year-score">{formatScore(value.average)}</b>
      <small>{value.months} tháng</small>
    </button>
  );
}

function RankBadge({ row }) {
  if (row.rank == null) return <span className="ev-muted" title="Chưa có tháng được chấm">—</span>;
  const warning = row.stats.violations > 0 || row.stats.no_grade > 0;
  return (
    <span className="ev-rank" title={warning ? "Có tháng vi phạm hoặc không xếp loại" : undefined}>
      <b className={MEDALS[row.rank] ?? ""}>{row.rank}</b>
      {warning && <TriangleAlert size={12} className="ev-text-red" />}
    </span>
  );
}

function MonthCell({ cell, grades, frame, dense, onOpen }) {
  if (!cell) return <span className="ev-muted">—</span>;
  const outside = frame && cell.is_homeroom !== (frame === "yes");
  if (!cell.official) {
    return <button type="button" className={`ev-month-cell pending ${outside ? "outside" : ""}`} onClick={() => onOpen(cell.evaluation_id)}>{cell.pending_label}</button>;
  }
  const index = grades.findIndex((grade) => grade.key === cell.grade_key);
  const noGrade = cell.no_grade_reason || index < 0;
  const score = (
    <small>
      {formatScore(cell.total)}
      {cell.has_violation && <em className="ev-text-red"> · VP</em>}
    </small>
  );
  return (
    <button
      type="button"
      className={`ev-month-cell ${outside ? "outside" : ""}`}
      onClick={() => onOpen(cell.evaluation_id)}
      title={[outside ? "Không tính: khác khung chủ nhiệm đang lọc" : null, noGrade ? `Không xếp loại${cell.no_grade_reason ? `: ${cell.no_grade_reason}` : ""}` : cell.grade_name, cell.has_violation ? "Có vi phạm" : null, cell.is_homeroom ? "GVCN" : null].filter(Boolean).join(" · ")}
    >
      {dense && score}
      <span className={`ev-chip ${noGrade ? "red" : GRADE_TONES[index]}`}>{noGrade ? "KXL" : dense ? gradeCode(grades[index].short) : grades[index].short}</span>
      {!dense && score}
    </button>
  );
}

function SummaryPrint({ summary, rows, homeroom }) {
  const { periods, grades } = summary;
  const officialCount = periods.filter((period) => period.official).length;
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
      <p className="center">{summary.range_label}{homeroom ? (homeroom === "yes" ? " · Giáo viên chủ nhiệm" : " · Giáo viên không chủ nhiệm") : ""}</p>
      <table>
        <thead>
          <tr>
            <th style={{ width: "4%" }}>STT</th>
            <th style={{ width: "4%" }}>Hạng</th>
            <th style={{ width: "16%" }}>Họ và tên</th>
            <th style={{ width: "12%" }}>Tổ / nhóm</th>
            {summary.all_years
              ? summary.year_columns.map((column) => <th key={column.value}>Năm học {column.label}</th>)
              : periods.map((period) => <th key={period.id}>{period.label}{!period.official && <><br />(chưa công bố)</>}</th>)}
            {grades.map((grade) => <th key={grade.key}>{grade.short}</th>)}
            <th>KXL</th>
            <th>Vi phạm</th>
            <th>Số tháng</th>
            <th>Điểm TB</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td className="center">{index + 1}</td>
              <td className="center">{row.rank ?? ""}</td>
              <td>{row.name}</td>
              <td>{[row.team?.name, row.group?.name].filter(Boolean).join(" / ")}</td>
              {summary.all_years
                ? summary.year_columns.map((column) => <td key={column.value} className="center">{row.years?.[column.value] ? `${formatScore(row.years[column.value].average)} (${row.years[column.value].months} th)` : "—"}</td>)
                : periods.map((period) => <td key={period.id} className="center">{cellText(row.cells[period.id])}</td>)}
              {grades.map((grade) => <td key={grade.key} className="center">{row.stats.counts[grade.key] ?? 0}</td>)}
              <td className="center">{row.stats.no_grade}</td>
              <td className="center">{row.stats.violations}</td>
              <td className="center">{row.stats.months}/{officialCount}</td>
              <td className="center">{row.stats.average == null ? "" : formatScore(row.stats.average)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ev-print-note">Chỉ tính các tháng đã công bố. KXL: không xếp loại; VP: có vi phạm; Điểm TB: trung bình tổng điểm các tháng được chấm. Bảng xếp hạng chỉ để tham khảo.</p>
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
