/**
 * How many days you missed together since your last day together (`lastBoth`,
 * "YYYY-MM-DD"), not counting today, which isn't over yet. 0 when the streak
 * isn't broken or there's never been a day together. Matches restore_streak().
 */
export function missedDays(lastBoth, now = new Date(), timeZone = localZone()) {
  if (!lastBoth) return 0;
  const today = localDay(now, timeZone);
  const gap = Math.round((Date.parse(today) - Date.parse(lastBoth)) / 86_400_000) - 1;
  return Math.max(0, gap);
}

function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos";
  } catch {
    return "Africa/Lagos";
  }
}

/** The calendar day in `timeZone`, "YYYY-MM-DD". */
function localDay(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }
}
