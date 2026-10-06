import { Brain, Crown, Flame, Handshake, MessagesSquare, Palette, Puzzle, Spade, WholeWord, Zap } from "lucide-react";

/** Category icon keys (lib/game/categories.js) → Lucide icons, the project's icon set. */
export const CATEGORY_ICONS = {
  messages: MessagesSquare,
  board: Crown,
  cards: Spade,
  brain: Brain,
  together: Handshake,
  bolt: Zap,
  puzzle: Puzzle,
  letters: WholeWord,
  flame: Flame,
  palette: Palette,
};

/** Palette accents per category (text + subtle ring), never the only signal of state. */
export const ACCENT_CLASSES = {
  pink: { text: "text-pink-400", ring: "ring-pink-400/60", dot: "bg-pink-400" },
  green: { text: "text-green-500", ring: "ring-green-500/70", dot: "bg-green-500" },
  blue: { text: "text-blue-400", ring: "ring-blue-400/60", dot: "bg-blue-400" },
  red: { text: "text-red-500", ring: "ring-red-500/60", dot: "bg-red-500" },
};
