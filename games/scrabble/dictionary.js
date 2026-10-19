import WORDS from "./words";

/**
 * Word validation for the word board — deterministic and local: the server
 * checks words against the ENABLE list (public domain, games/scrabble/words.js).
 * Nothing about a game is sent to any outside service. Built once per server
 * process on first use (~170k words).
 */
let words = null;

export function isWord(word) {
  words ??= new Set(WORDS.split("\n"));
  return words.has(String(word).toLowerCase());
}
