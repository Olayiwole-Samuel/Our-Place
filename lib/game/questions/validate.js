/**
 * Question validation — applied to every question before it can reach a game,
 * whatever its source (curated bank now, AI generation later). Content is
 * always rendered as plain text; this also rejects anything that isn't a clean
 * short string.
 *
 *   { id, optionA, optionB, category? }
 */
export const MAX_OPTION_LENGTH = 120;
const ID = /^[a-z0-9][a-z0-9_:-]{0,63}$/;
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/;
const MARKUP = /<\s*\/?\s*[a-z!]/i;

function cleanOption(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || [...text].length > MAX_OPTION_LENGTH || CONTROL.test(text) || MARKUP.test(text)) return null;
  return text;
}

/** Returns a frozen, normalised question or null. */
export function validateQuestion(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.id !== "string" || !ID.test(raw.id)) return null;
  const optionA = cleanOption(raw.optionA);
  const optionB = cleanOption(raw.optionB);
  if (!optionA || !optionB || optionA.toLowerCase() === optionB.toLowerCase()) return null;
  const question = { id: raw.id, optionA, optionB };
  if (typeof raw.category === "string" && /^[a-z_]{1,32}$/.test(raw.category)) question.category = raw.category;
  return Object.freeze(question);
}
