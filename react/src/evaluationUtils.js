export const STATUS_TONES = { draft: "muted", submitted: "blue", unit_scored: "teal", published: "green" };
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

export const cellScore = (row, column) => {
  if (column !== "final") return row?.[`${column}_score`];
  const leader = row?.leader_score ?? "";
  return leader !== "" ? leader : row?.unit_score;
};

export function computeTotals(sections, rows, column, isHomeroom) {
  const bySection = {};
  const invalid = [];
  let base = 0;
  let bonus = 0;
  sections.forEach((section) => {
    if (section.homeroom_only && !isHomeroom) return;
    let sum = 0;
    section.criteria.forEach((criterion) => {
      const raw = cellScore(rows[criterion.id], column);
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

export function hasZeroCriterion(sections, rows, column, isHomeroom) {
  return sections
    .filter((section) => section.kind !== "bonus" && (!section.homeroom_only || isHomeroom))
    .some((section) => section.criteria.some((criterion) => criterion.max_score > 0 && !(parseScore(cellScore(rows[criterion.id], column)) > 0)));
}

export function suggestGrade(grades, total, isHomeroom, hasViolation, hasZero = false) {
  for (const grade of grades ?? []) {
    if ((grade.clean_required && hasViolation) || (grade.requires_no_zero && hasZero)) continue;
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

export const YEAR_START_MONTH = 8;
export const schoolYearOf = (year, month) => (month >= YEAR_START_MONTH ? year : year - 1);
export const schoolYearLabel = (year) => `${year}–${year + 1}`;
export const GRADE_TONES = ["green", "blue", "violet", "orange", "muted", "muted"];
export const formatPercent = (value) => (value == null ? "—" : `${formatScore(value)}%`);

export function gradeCode(label) {
  const text = (label ?? "").replace(/\s*\(.*\)\s*$/, "").replace(/^mức\s+(?=xuất sắc)/i, "").trim();
  if (/^xuất sắc$/i.test(text)) return "XS";
  const level = /^(?:loại|mức)\s+(.+)$/i.exec(text);
  if (level) return level[1];
  return text.split(/\s+/).map((word) => word.charAt(0).toUpperCase()).join("") || text;
}

const GRADE_CODE_TONES = { XS: "green", A: "blue", B: "violet", C: "orange" };

export function gradeTone(label) {
  return GRADE_CODE_TONES[gradeCode(label)] ?? "muted";
}

export function gradeShort(label) {
  return (label ?? "").replace(/\s*\(.*\)\s*$/, "").trim();
}
