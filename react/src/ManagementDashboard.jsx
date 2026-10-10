import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Award, ChevronRight, ClipboardCheck, Database, RefreshCw, TriangleAlert, UserX, Users } from "lucide-react";
import { apiFetch } from "./api";
import { formatBytes } from "./fileUtils";
import "./ManagementDashboard.css";
import "./Skeleton.css";

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const number = (value) => (value == null ? "—" : Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 }));
const shortDate = (value) => (value ? value.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "");
const daysUntil = (value) => {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${value}T00:00:00`) - today) / 86400000);
};
const GRADE_TONES = ["g1", "g2", "g3", "g4", "g5", "g6"];

export default function ManagementDashboard({ onKpi }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await apiFetch("/api/dashboard", { silent: true });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Không thể tải Tổng quan.");
      setData(payload);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, [load]);

  if (!data) {
    return error ? (
      <div className="home">
        <div className="kpi-error">{error}</div>
      </div>
    ) : (
      <DashboardSkeleton />
    );
  }

  const today = new Date();
  const openTasks = (filter) => window.dispatchEvent(new CustomEvent("dashboard:task-filter", { detail: filter }));
  const follow = (link) => (link.tasks ? openTasks(link.tasks) : navigate(link.route));
  const { personnel, tasks, evaluation, library, results, attention } = data;

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <h2>Tổng quan toàn trường</h2>
          <p>{WEEKDAYS[today.getDay()]}, {today.toLocaleDateString("vi-VN")} · số liệu toàn hệ thống</p>
        </div>
        <button type="button" className="secondary-btn" onClick={load} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? "spin" : ""} /> Làm mới
        </button>
      </header>
      {error && <div className="kpi-error">{error}</div>}

      <section className="home-modules">
        <button type="button" className="home-module" onClick={() => navigate("/personnel")}>
          <span className="home-module-head"><Users size={17} /> Nhân sự</span>
          <b>{number(personnel.total)} <small>đang công tác</small></b>
          <span className="home-module-parts">
            {personnel.by_audience.filter((row) => row.count).map((row) => <span key={row.audience}>{row.label} <b>{row.count}</b></span>)}
          </span>
          <small className={personnel.absent_today ? "warn" : ""}>{personnel.absent_today ? `${personnel.absent_today} người vắng hôm nay` : "Hôm nay không ai vắng"}</small>
        </button>

        <button type="button" className="home-module" onClick={onKpi}>
          <span className="home-module-head"><ClipboardCheck size={17} /> Công việc tháng {tasks.period}</span>
          <b>{tasks.completion_rate == null ? "—" : `${number(tasks.completion_rate)}%`} <small>hoàn thành</small></b>
          <span className="home-module-parts">
            <span>Có hạn <b>{tasks.assigned}</b></span>
            <span>Chờ duyệt <b>{tasks.waiting}</b></span>
            <span className={tasks.overdue ? "bad" : ""}>Quá hạn <b>{tasks.overdue}</b></span>
          </span>
          <small>Bấm để xem Thống kê</small>
        </button>

        <button type="button" className="home-module" disabled={!evaluation} onClick={() => evaluation && navigate(`/evaluations?tab=board&period=${evaluation.id}`)}>
          <span className="home-module-head"><Award size={17} /> Thi đua {evaluation ? evaluation.label : ""}</span>
          {evaluation ? (
            <>
              <b>{evaluation.submitted}/{evaluation.total} <small>phiếu đã nộp</small></b>
              <span className="home-progress"><i style={{ width: `${evaluation.total ? (evaluation.scored / evaluation.total) * 100 : 0}%` }} className="scored" /><i style={{ width: `${evaluation.total ? ((evaluation.submitted - evaluation.scored) / evaluation.total) * 100 : 0}%` }} className="submitted" /></span>
              <span className="home-module-parts">
                <span>Đã chấm <b>{evaluation.scored}</b></span>
                {evaluation.awaiting_leader > 0 && <span className="warn">Chờ BGH <b>{evaluation.awaiting_leader}</b></span>}
              </span>
              <small>{evaluation.status_label}{evaluation.self_due_on ? ` · tự chấm đến ${shortDate(evaluation.self_due_on)}` : ""}</small>
            </>
          ) : (
            <b className="muted">Chưa mở kỳ</b>
          )}
        </button>

        <button type="button" className="home-module" onClick={() => navigate("/library")}>
          <span className="home-module-head"><Database size={17} /> Kho dữ liệu</span>
          <b>{number(library.files)} <small>file</small></b>
          <span className="home-module-parts">
            <span>Thư mục <b>{number(library.folders)}</b></span>
            <span>Dung lượng <b>{formatBytes(library.bytes)}</b></span>
          </span>
          <small>{library.new_week ? `${library.new_week} file mới trong 7 ngày` : "Chưa có file mới trong 7 ngày"}</small>
        </button>
      </section>

      <section className="home-card home-attention">
        <header>
          <h3><TriangleAlert size={17} /> Cần chú ý toàn trường</h3>
          <small>{attention.length ? `${attention.length} mục` : ""}</small>
        </header>
        {attention.length ? (
          <ul>
            {attention.map((item, index) => (
              <li key={index}>
                <button type="button" className={item.tone} onClick={() => follow(item.link)}>
                  <i />
                  <span>{item.text}</span>
                  <ChevronRight size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="home-empty">Mọi thứ đang ổn — không có cảnh báo nào.</p>
        )}
      </section>

      <div className="home-pair">
        <section className="home-card">
          <header>
            <h3><Award size={17} /> Kết quả thi đua {results ? results.current.label : ""}</h3>
            {results && <button type="button" className="home-link" onClick={() => navigate("/evaluations/summary")}>Tổng hợp <ChevronRight size={14} /></button>}
          </header>
          {results ? <Results results={results} /> : <p className="home-empty">Chưa có kỳ đánh giá nào được công bố.</p>}
        </section>

        <section className="home-card">
          <header>
            <h3><Users size={17} /> Nhân sự theo tổ</h3>
            <button type="button" className="home-link" onClick={() => navigate("/personnel/structure")}>Cơ cấu tổ chức <ChevronRight size={14} /></button>
          </header>
          <ul className="home-units">
            {personnel.units.map((unit) => (
              <li key={unit.id}>
                <span>{unit.name}</span>
                <b>{unit.members} <small>người</small></b>
                <small>{unit.tasks ? `${unit.tasks} việc · ${unit.completion_rate == null ? "—" : `${number(unit.completion_rate)}%`} hoàn thành` : "Chưa có việc tháng này"}</small>
              </li>
            ))}
          </ul>
          <div className="home-absent">
            <h4><UserX size={15} /> Vắng hôm nay {personnel.absent_today ? `· ${personnel.absent_today}` : ""}</h4>
            {personnel.absent.length ? (
              <ul>
                {personnel.absent.map((row, index) => (
                  <li key={index}>
                    <b>{row.name}</b>
                    <span className={`home-leave-type ${row.type}`}>{row.type_label}</span>
                    <small>đến {shortDate(row.until)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="home-muted">Không ai nghỉ hôm nay.</p>
            )}
            <button type="button" className="home-link" onClick={() => navigate("/personnel/leave")}>
              {personnel.absent_week} người có lịch nghỉ trong 7 ngày tới · Theo dõi nghỉ <ChevronRight size={14} />
            </button>
          </div>
        </section>
      </div>
      <p className="home-note">
        Công việc tính theo hạn trong tháng, không tính việc đã hủy; tỷ lệ hoàn thành tính trên các việc đã đến hạn hoặc đã xong.
        {daysUntil(evaluation?.self_due_on) != null && daysUntil(evaluation.self_due_on) >= 0 ? ` Hạn tự chấm kỳ ${evaluation.label} còn ${daysUntil(evaluation.self_due_on)} ngày.` : ""}
      </p>
    </div>
  );
}

function Results({ results }) {
  const { current, previous } = results;
  const graded = current.grades.reduce((sum, grade) => sum + grade.count, 0) + current.no_grade;
  const delta = previous?.average != null && current.average != null ? Math.round((current.average - previous.average) * 10) / 10 : null;
  return (
    <div className="home-results">
      <div className="home-results-top">
        <span>
          <b>{number(current.average)}</b> <small>điểm trung bình</small>
        </span>
        {delta != null && <small className={delta > 0 ? "good" : delta < 0 ? "bad" : ""}>{delta > 0 ? "↑" : delta < 0 ? "↓" : "↔"} {number(Math.abs(delta))} so với {previous.label}</small>}
        <small>{current.total} phiếu</small>
      </div>
      <span className="home-grade-bar">
        {current.grades.map((grade, index) => grade.count > 0 && <i key={grade.code} className={GRADE_TONES[index]} style={{ width: `${(grade.count / (graded || 1)) * 100}%` }} title={`${grade.name}: ${grade.count}`} />)}
        {current.no_grade > 0 && <i className="none" style={{ width: `${(current.no_grade / (graded || 1)) * 100}%` }} title={`Không xếp loại: ${current.no_grade}`} />}
      </span>
      <ul className="home-grades">
        {current.grades.map((grade, index) => {
          const before = previous?.grades.find((row) => row.code === grade.code)?.count;
          return (
            <li key={grade.code}>
              <i className={GRADE_TONES[index]} />
              <span>{grade.name}</span>
              <b>{grade.count}</b>
              <small>{graded ? `${number((grade.count / graded) * 100)}%` : "—"}{before != null && before !== grade.count ? ` · kỳ trước ${before}` : ""}</small>
            </li>
          );
        })}
        {current.no_grade > 0 && (
          <li>
            <i className="none" />
            <span>Không xếp loại</span>
            <b>{current.no_grade}</b>
            <small>{number((current.no_grade / graded) * 100)}%</small>
          </li>
        )}
      </ul>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="home home-skeleton" aria-busy="true" aria-label="Đang tải Tổng quan">
      <header className="home-head">
        <div>
          <i className="sk" style={{ width: 260, height: 26 }} />
          <i className="sk" style={{ width: 200, height: 14, marginTop: 8 }} />
        </div>
        <i className="sk" style={{ width: 96, height: 36, borderRadius: 9 }} />
      </header>
      <section className="home-modules">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="home-module">
            <i className="sk" style={{ width: "45%", height: 14 }} />
            <i className="sk" style={{ width: "60%", height: 28 }} />
            <i className="sk" style={{ width: "85%", height: 12 }} />
            <i className="sk" style={{ width: "55%", height: 12 }} />
          </div>
        ))}
      </section>
      <section className="home-card home-attention">
        <i className="sk" style={{ width: 200, height: 16 }} />
        <ul>
          {Array.from({ length: 4 }, (_, index) => <li key={index}><i className="sk" style={{ width: "100%", height: 40, borderRadius: 10 }} /></li>)}
        </ul>
      </section>
      <div className="home-pair">
        {Array.from({ length: 2 }, (_, index) => (
          <section key={index} className="home-card">
            <i className="sk" style={{ width: 220, height: 16 }} />
            <i className="sk" style={{ width: "40%", height: 28 }} />
            <i className="sk" style={{ width: "100%", height: 14, borderRadius: 99 }} />
            <div className="home-sk-grid">
              {Array.from({ length: 6 }, (_, cell) => <i key={cell} className="sk" style={{ height: 52, borderRadius: 10 }} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
