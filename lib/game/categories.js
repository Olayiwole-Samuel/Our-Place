/**
 * Game categories — pure data. The in-world game menu renders from this list,
 * so adding a category means adding an entry here; neither the menu nor the
 * engine changes.
 *
 *   order    menu position (1 = top)
 *   emoji    the category's mark in copy and as a fallback game icon
 *   icon     a key into the menu's icon map (components/lobby/games/categoryIcons.js);
 *            kept as a string so this module stays UI-free (server and tests use it)
 *   accent   a palette token name; black/green/pink stay dominant, sky blue marks
 *            realtime play, red is reserved for the 18+ category
 *   mature   18+, opt-in, off by default, couple-only (see lib/game/gating.js)
 */
export const GAME_CATEGORIES = Object.freeze(
  [
    { id: "talk_party", name: "Talk & Party", emoji: "💬", icon: "messages", accent: "pink", description: "Questions and conversation to play out loud.", order: 1 },
    { id: "board_strategy", name: "Board & Strategy", emoji: "♟️", icon: "board", accent: "green", description: "Classic boards and slow-burn strategy.", order: 2 },
    { id: "card_games", name: "Card Games", emoji: "🃏", icon: "cards", accent: "green", description: "Shuffle up, deal in.", order: 3 },
    { id: "trivia_quiz", name: "Trivia & Quiz", emoji: "🧠", icon: "brain", accent: "blue", description: "How well do you know things — and each other?", order: 4 },
    { id: "co_op", name: "Co-op", emoji: "🤝", icon: "together", accent: "pink", description: "Same team, shared goal.", order: 5 },
    { id: "quick_casual", name: "Quick & Casual", emoji: "⚡", icon: "bolt", accent: "blue", description: "Fast rounds, instant rematches.", order: 6 },
    { id: "puzzle", name: "Puzzle", emoji: "🧩", icon: "puzzle", accent: "green", description: "Piece it together.", order: 7 },
    { id: "word_games", name: "Word Games", emoji: "🔤", icon: "letters", accent: "green", description: "Spell it, find it, play it.", order: 8 },
    { id: "flirty_spicy", name: "Flirty / Spicy", emoji: "🔥", icon: "flame", accent: "red", description: "Just for the two of you. 18+, opt-in.", order: 9, mature: true },
    { id: "chill_create", name: "Chill / Create", emoji: "🎨", icon: "palette", accent: "pink", description: "Draw, listen, watch, decorate — no score.", order: 10 },
  ].map((category) => Object.freeze({ mature: false, ...category })),
);

const categoriesById = new Map(GAME_CATEGORIES.map((category) => [category.id, category]));

export function getCategory(id) {
  return categoriesById.get(id) ?? null;
}

export function isGameCategory(id) {
  return categoriesById.has(id);
}
