import { useEffect, useState } from "react";
import { Link } from "react-router";
import { apiJson } from "./api";
import { GRADE_TONES, formatScore } from "./evaluationUtils";
import "./Evaluation.css";
import Dropdown from "./Dropdown";

export default function EvaluationTeacherHistory({ teacherId }) {
  const [summary, setSummary] = useState(null);
  const [year, setYear] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson(`/api/evaluation-summary/teachers/${teacherId}${year ? `?school_year=${year}` : ""}`)
      .then((result) => {
        setSummary(result);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [teacherId, year]);

  if (error) return <p className="ev-muted">{error}</p>;
  if (!summary) return <p className="ev-muted">Đang tải...</p>;

  const { teacher, periods, grades } = summary;
  const stats = teacher?.stats;
  return (
    <div className="ev-teacher-history">
      <div className="ev-teacher-history-head">
        <Dropdown label="Năm học" value={summary.school_year} onChange={(value) => setYear(value)} options={summary.school_years.map((item) => ({ value: item.value, label: `Năm học ${item.label}` }))} />
        {stats?.months ? (
          <span>
            {grades.filter((grade) => stats.counts[grade.key]).map((grade) => `${stats.counts[grade.key]} ${grade.short}`).join(" · ")}
            {stats.no_grade > 0 && ` · ${stats.no_grade} KXL`}
            {stats.violations > 0 && <b className="ev-text-red"> · {stats.violations} tháng vi phạm</b>}
            {stats.average != null && <> · Điểm TB <b>{formatScore(stats.average)}</b></>}
          </span>
        ) : (
          <span className="ev-muted">Chưa có tháng nào được công bố.</span>
        )}
      </div>
      {teacher && periods.length > 0 && (
        <div className="ev-teacher-months">
          {periods.map((period) => {
            const cell = teacher.cells[period.id];
            if (!cell) return <span key={period.id} className="ev-teacher-month empty"><small>{period.label}</small>—</span>;
            const index = grades.findIndex((grade) => grade.key === cell.grade_key);
            const noGrade = cell.official && (cell.no_grade_reason || index < 0);
            return (
              <Link key={period.id} to={`/evaluations/${cell.evaluation_id}`} className={`ev-teacher-month ${cell.official ? "" : "pending"}`} title={cell.no_grade_reason ?? undefined}>
                <small>{period.label}</small>
                {cell.official ? (
                  <>
                    <span className={`ev-chip ${noGrade ? "red" : GRADE_TONES[index]}`}>{noGrade ? "KXL" : grades[index].short}</span>
                    <em>{formatScore(cell.total)}{cell.has_violation ? " · VP" : ""}</em>
                  </>
                ) : (
                  <em>{cell.pending_label}</em>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
