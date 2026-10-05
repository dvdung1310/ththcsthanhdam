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

export const SCORE_PATTERN = /^\d*([.,]\d*)?$/;

export function scoreError(value, max) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!SCORE_PATTERN.test(text) || text === "," || text === ".") return "Chỉ nhập số";
  if ((text.split(/[.,]/)[1] ?? "").length > 2) return "Tối đa 2 chữ số thập phân";
  if (parseScore(text) > max) return `Tối đa ${formatScore(max)} điểm`;
  return null;
}

export const normalizeScore = (value) => String(value ?? "").trim().replace(".", ",").replace(/,$/, "").replace(/^0+(?=\d)/, "");

export function computeTotals(sections, rows, column, isHomeroom) {
  const bySection = {};
  const invalid = [];
  let base = 0;
  let bonus = 0;
  sections.forEach((section) => {
    if (section.homeroom_only && !isHomeroom) return;
    let sum = 0;
    section.criteria.forEach((criterion) => {
      const raw = rows[criterion.id]?.[`${column}_score`];
      if (scoreError(raw, criterion.max_score)) {
        if (!invalid.includes(section.id)) invalid.push(section.id);
        return;
      }
      const value = parseScore(raw);
      if (value !== null) sum += clamp(value, criterion.max_score);
    });
    sum = clamp(sum, section.max_score);
    bySection[section.id] = Math.round(sum * 100) / 100;
    if (section.kind === "bonus") bonus += sum;
    else base += sum;
  });
  const round = (value) => Math.round(value * 100) / 100;
  return { sections: bySection, invalid, base: round(base), bonus: round(bonus), total: round(base + bonus) };
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

const dayOnly = (value) => {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};
const localDay = (value) => (String(value).length > 10 ? new Date(new Date(value).toDateString()) : dayOnly(value));

export function daysPast(due, at = new Date()) {
  if (!due) return 0;
  return Math.round((localDay(at) - dayOnly(due)) / 86400000);
}
