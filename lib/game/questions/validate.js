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

export const MAX_PROMPT_LENGTH = 200;

/**
 * A single prompt (Truth or Dare, Question Roulette, trivia…): { id, text, category?, options?, answer? }.
 * Same rules as an option — plain, short text — with room for a sentence or two.
 */
export function validatePrompt(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.id !== "string" || !ID.test(raw.id) || typeof raw.text !== "string") return null;
  const text = raw.text.replace(/\s+/g, " ").trim();
  if (!text || [...text].length > MAX_PROMPT_LENGTH || CONTROL.test(text) || MARKUP.test(text)) return null;
  const prompt = { id: raw.id, text };
  if (typeof raw.category === "string" && /^[a-z_]{1,32}$/.test(raw.category)) prompt.category = raw.category;
  // Multiple choice: 2–6 clean, different options; `answer` (optional) is the right one's index.
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 6) return null;
    const options = raw.options.map(cleanOption);
    if (options.some((option) => !option) || new Set(options.map((option) => option.toLowerCase())).size !== options.length) return null;
    prompt.options = options;
    if (raw.answer !== undefined) {
      if (!Number.isInteger(raw.answer) || raw.answer < 0 || raw.answer >= options.length) return null;
      prompt.answer = raw.answer;
    }
  }
  return Object.freeze(prompt);
}
