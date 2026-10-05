export const STATUS_TONES = { draft: "muted", submitted: "blue", unit_scored: "purple", published: "green" };
export const PERIOD_TONES = { open: "blue", disclosed: "orange", published: "green" };

export function parseScore(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : NaN;
}

export function formatScore(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

const clamp = (value, max) => Math.max(0, Math.min(value, max));

export function cellValue(row, column) {
  if (column === "final") return row.final_score === "" || row.final_score == null ? row.unit_score : row.final_score;
  return row[`${column}_score`];
}

export function computeTotals(sections, rows, column, isHomeroom) {
  const bySection = {};
  let base = 0;
  let bonus = 0;
  sections.forEach((section) => {
    if (section.homeroom_only && !isHomeroom) return;
    let sum = 0;
    section.criteria.forEach((criterion) => {
      const value = parseScore(cellValue(rows[criterion.id] ?? {}, column));
      if (value !== null && !Number.isNaN(value)) sum += clamp(value, criterion.max_score);
    });
    sum = clamp(sum, section.max_score);
    bySection[section.id] = Math.round(sum * 100) / 100;
    if (section.kind === "bonus") bonus += sum;
    else base += sum;
  });
  const round = (value) => Math.round(value * 100) / 100;
  return { sections: bySection, base: round(base), bonus: round(bonus), total: round(base + bonus) };
}

export function suggestGrade(grades, total, isHomeroom, hasViolation) {
  for (const grade of grades ?? []) {
    if (grade.clean_required && hasViolation) continue;
    if (total >= (isHomeroom ? grade.homeroom_min : grade.regular_min)) return grade;
  }
  return null;
}

export function maxBase(sections, isHomeroom) {
  return sections.filter((section) => section.kind !== "bonus" && (!section.homeroom_only || isHomeroom)).reduce((sum, section) => sum + section.max_score, 0);
}

export const formatDay = (value) => (value ? new Date(value).toLocaleDateString("vi-VN") : "—");
export const formatMoment = (value) => (value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—");
