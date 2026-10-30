/**
 * Text a player types into a game (a statement, an answer, a line of a story):
 * control characters out, whitespace collapsed, ends trimmed, length checked
 * in characters (emoji count as one). Returns the clean text or null. Games
 * always render it as plain text.
 */
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

export function cleanText(raw, max, min = 1) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(CONTROL, "").replace(/\s+/g, " ").trim();
  const length = [...text].length;
  return length >= min && length <= max ? text : null;
}
