/**
 * Time together, in the couple's own calendar (local time, from the day they
 * got together — couples.together_since, or the pairing day as a fallback).
 * Shared by the "Us" page, the bookshelf and the heart on the wall.
 */
const DAY = 86_400_000;

/** "YYYY-MM-DD" → that calendar day at local midnight; an ISO timestamp → its local day. */
export function parseDay(since) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(since ?? "");
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(since);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const localDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Adds months, keeping the day (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(date, months) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
}

/**
 * Everything the countdowns need:
 *   since, days, months, extraDays, seconds (total, live)
 *   next   the coming monthsary { months, on, inDays }
 *   year   the coming anniversary { number, on, from, progress 0..1 }
 *   today  { monthsary: n | 0, anniversary: n | 0 } — today IS one
 */
export function togetherSince(since, now = new Date()) {
  const start = parseDay(since);
  const today = localDay(now);
  const days = Math.max(0, Math.round((today - start) / DAY));
  let months = Math.max(0, (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth());
  if (months && addMonths(start, months) > today) months -= 1;
  const extraDays = Math.max(0, Math.round((today - addMonths(start, months)) / DAY));
  const nextOn = addMonths(start, months + 1);

  const years = Math.floor(months / 12);
  const from = addMonths(start, years * 12);
  const yearOn = addMonths(start, (years + 1) * 12);
  const progress = Math.min(1, Math.max(0, (now - from) / (yearOn - from)));

  const isDay = extraDays === 0 && months > 0;
  return {
    since: start,
    days,
    months,
    extraDays,
    seconds: Math.max(0, Math.floor((now - start) / 1000)),
    next: { months: months + 1, on: nextOn, inDays: Math.round((nextOn - today) / DAY) },
    year: { number: years + 1, on: yearOn, from, progress },
    today: { monthsary: isDay ? months : 0, anniversary: isDay && months % 12 === 0 ? months / 12 : 0 },
  };
}

/** Time left until `target`: { days, hours, minutes, seconds }. */
export function countdown(target, now = new Date()) {
  const left = Math.max(0, Math.floor((target - now) / 1000));
  return { days: Math.floor(left / 86_400), hours: Math.floor(left / 3600) % 24, minutes: Math.floor(left / 60) % 60, seconds: left % 60 };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "7 months, 14 days" / "1 year, 2 months" / "12 days". */
export function durationText({ months, extraDays }) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years) return [plural(years, "year"), rest && plural(rest, "month")].filter(Boolean).join(", ");
  if (months) return [plural(months, "month"), extraDays && plural(extraDays, "day")].filter(Boolean).join(", ");
  return plural(extraDays, "day");
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th")}`;
}

/** 8 → "8-month anniversary"; 12 → "1st anniversary". */
export function anniversaryLabel(months) {
  return months % 12 ? `${months}-month anniversary` : `${ordinal(months / 12)} anniversary`;
}
