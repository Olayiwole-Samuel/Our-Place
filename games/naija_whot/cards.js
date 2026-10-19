/**
 * The Whot deck — 54 cards, the standard Nigerian pack:
 *
 *   circle    1 2 3 4 5 7 8 10 11 12 13 14   (12)
 *   triangle  1 2 3 4 5 7 8 10 11 12 13 14   (12)
 *   cross     1 2 3 5 7 10 11 13 14          (9)
 *   square    1 2 3 5 7 10 11 13 14          (9)
 *   star      1 2 3 4 5 7 8                  (7)
 *   whot      20 ×5                          (5)
 *
 * Shared by the rules (server) and the client (drawing faces). A card id is
 * "<shape>-<number>" ("whot-20-a"… for the five Whot cards).
 */
export const SHAPES = Object.freeze(["circle", "triangle", "cross", "square", "star"]);
export const WHOT = "whot";

const NUMBERS = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
};

export const DECK = Object.freeze([
  ...SHAPES.flatMap((shape) => NUMBERS[shape].map((number) => `${shape}-${number}`)),
  ...["a", "b", "c", "d", "e"].map((copy) => `whot-20-${copy}`),
]);

/** { id, shape, number } for a card id, or null. */
export function parseCard(id) {
  if (typeof id !== "string" || !DECK.includes(id)) return null;
  const [shape, number] = id.split("-");
  return { id, shape, number: Number(number) };
}

/** Points a card counts when hands are counted: face value, stars double, Whot 20. */
export function cardPoints(id) {
  const card = parseCard(id);
  if (!card) return 0;
  if (card.shape === WHOT) return 20;
  return card.shape === "star" ? card.number * 2 : card.number;
}

export const SHAPE_LABEL = Object.freeze({ circle: "Circle", triangle: "Triangle", cross: "Cross", square: "Square", star: "Star", whot: "Whot" });
