import { GAME_CATEGORIES } from "./categories";
import { defineGame } from "./definition";

/**
 * Creates a lookup over validated game definitions. Pure and side-effect free so it
 * can be used by the menu (client), the game server and tests alike.
 */
export function createGameRegistry(definitions = []) {
  const games = new Map();
  for (const input of definitions) {
    const definition = Object.isFrozen(input) ? input : defineGame(input);
    if (games.has(definition.id)) throw new Error(`Duplicate game id "${definition.id}".`);
    games.set(definition.id, definition);
  }

  return Object.freeze({
    get: (id) => games.get(id) ?? null,
    has: (id) => games.has(id),
    list: () => [...games.values()],
    listByCategory: (categoryId) => [...games.values()].filter((game) => game.category === categoryId),
    /** Categories in menu order with their games; empty categories are omitted. */
    groupByCategory: () =>
      [...GAME_CATEGORIES]
        .sort((a, b) => a.order - b.order)
        .map((category) => ({ category, games: [...games.values()].filter((g) => g.category === category.id) }))
        .filter((group) => group.games.length > 0),
  });
}
