/**
 * Invite-code format, shared by the client (input UX) and server (early
 * validation). The database is still the authority — it re-validates and
 * normalises every code (see public.join_couple).
 *
 * 31 symbols: A–Z and 2–9 without the easily-confused 0/O and 1/I/L.
 */
export const INVITE_CODE_LENGTH = 6;
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const VALID = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

/**
 * Turns whatever was typed or pasted ("a7k-9q2", " A7K9Q2 ") into the canonical
 * form, dropping characters that can never appear in a code.
 * Returns { code, dropped } where `dropped` reports removed letters/digits.
 */
export function sanitizeInviteCode(raw) {
  const compact = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let code = "";
  let dropped = false;
  for (const char of compact) {
    if (code.length === INVITE_CODE_LENGTH) break;
    if (INVITE_CODE_ALPHABET.includes(char)) code += char;
    else dropped = true;
  }
  return { code, dropped };
}

export function isValidInviteCode(code) {
  return typeof code === "string" && VALID.test(code);
}
