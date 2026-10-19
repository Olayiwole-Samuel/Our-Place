import { describe, expect, it } from "vitest";
import { GAME_CATEGORIES, getCategory } from "./categories";
import { capabilityFlags, gameRequirements, getCapabilities } from "./capabilities";
import { defineGame } from "./definition";
import { createGameRegistry } from "./registry";
import { gameRegistry } from "./catalog";

const loaders = { loadClient: async () => ({}), loadRules: async () => ({}) };

// Metadata from the product spec — test fixtures only, not production catalog entries.
const specGames = [
  { id: "ludo", category: "board_strategy", name: "Ludo", mode: "competitive", multiplayer: "turn_based", winStreakEligible: true },
  { id: "scrabble", category: "word_games", name: "Scrabble", mode: "competitive", multiplayer: "turn_based", winStreakEligible: true, capabilities: ["score_based", "hidden_information"] },
  { id: "shooting_range", category: "quick_casual", name: "Target Range", mode: "competitive", multiplayer: "realtime", winStreakEligible: true, capabilities: ["timed", "score_based"] },
  { id: "jigsaw_puzzle", category: "puzzle", name: "Jigsaw Puzzle", mode: "cooperative", multiplayer: "realtime", winStreakEligible: false },
  { id: "would_you_rather", category: "talk_party", name: "Would You Rather", mode: "conversation", multiplayer: "realtime", winStreakEligible: false, capabilities: ["ai_generated", "voice_enabled"] },
  { id: "drawing", category: "chill_create", name: "Drawing", mode: "creative", multiplayer: "realtime", authority: "relay", winStreakEligible: false },
].map((game) => ({ ...game, ...loaders }));

describe("game categories", () => {
  it("defines the 10 product categories with unique ids", () => {
    const ids = GAME_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual([
      "talk_party", "board_strategy", "card_games", "trivia_quiz", "co_op",
      "quick_casual", "puzzle", "word_games", "flirty_spicy", "chill_create",
    ]);
    expect(new Set(ids).size).toBe(10);
  });

  it("flags mature categories as data", () => {
    expect(getCategory("flirty_spicy").mature).toBe(true);
    expect(getCategory("talk_party").mature).toBe(false);
  });
});

describe("defineGame", () => {
  it("accepts every gameplay model from the spec", () => {
    for (const game of specGames) expect(() => defineGame(game)).not.toThrow();
  });

  it("derives capabilities from metadata", () => {
    const range = defineGame(specGames[2]);
    expect([...getCapabilities(range)]).toEqual(
      expect.arrayContaining(["realtime", "competitive", "timed", "score_based", "win_streak_eligible"]),
    );
    expect(getCapabilities(defineGame(specGames[3])).has("win_streak_eligible")).toBe(false);
  });

  it("requires explicit win-streak eligibility and restricts it to competitive games", () => {
    const { winStreakEligible: _omit, ...missing } = specGames[0];
    expect(() => defineGame(missing)).toThrow(/winStreakEligible/);
    expect(() => defineGame({ ...specGames[3], winStreakEligible: true })).toThrow(/competitive/);
  });

  it("rejects competitive games without server authority", () => {
    expect(() => defineGame({ ...specGames[0], authority: "relay" })).toThrow(/server/);
  });

  it("rejects more than two players, unknown categories and unknown capabilities", () => {
    expect(() => defineGame({ ...specGames[0], maxPlayers: 4 })).toThrow(/exactly two/);
    expect(() => defineGame({ ...specGames[0], category: "arcade" })).toThrow(/unknown category/);
    expect(() => defineGame({ ...specGames[0], capabilities: ["teleport"] })).toThrow(/unknown capability/);
  });

  it("validates the shell layout (panel by default, board for boards)", () => {
    expect(defineGame(specGames[0]).layout).toBe("panel");
    expect(gameRegistry.get("ludo")).toMatchObject({ layout: "board", status: "available", category: "board_strategy", winStreakEligible: true });
    expect(() => defineGame({ ...specGames[0], layout: "fullscreen" })).toThrow(/layout/);
  });

  it("requires lazy loaders only for available games", () => {
    expect(() => defineGame({ ...specGames[0], status: "available", loadClient: undefined })).toThrow(/loadClient/);
    expect(() => defineGame({ ...specGames[0], status: "available", loadRules: undefined })).toThrow(/loadRules/);
    const comingSoon = defineGame({ ...specGames[0], loadClient: undefined, loadRules: undefined });
    expect(comingSoon.status).toBe("coming_soon");
  });

  it("validates status, space and 18+ rules", () => {
    expect(() => defineGame({ ...specGames[0], status: "live" })).toThrow(/status/);
    expect(() => defineGame({ ...specGames[0], space: "../evil" })).toThrow(/space/);
    expect(defineGame({ ...specGames[2], space: "range_room" }).space).toBe("range_room");
    const spicy = { id: "spicy", category: "flirty_spicy", name: "Spicy", mode: "conversation", multiplayer: "turn_based", winStreakEligible: false };
    expect(defineGame(spicy).mature).toBe(true);
    expect(() => defineGame({ ...spicy, mode: "competitive", winStreakEligible: true })).toThrow(/18\+/);
  });
});

describe("createGameRegistry", () => {
  const registry = createGameRegistry(specGames);

  it("looks games up by id and category", () => {
    expect(registry.get("scrabble").name).toBe("Scrabble");
    expect(registry.get("chess")).toBeNull();
    expect(registry.listByCategory("puzzle").map((g) => g.id)).toEqual(["jigsaw_puzzle"]);
  });

  it("groups games by category in menu order, omitting empty categories", () => {
    const groups = registry.groupByCategory().map((g) => g.category.id);
    expect(groups).toEqual(["talk_party", "board_strategy", "quick_casual", "puzzle", "word_games", "chill_create"]);
  });

  it("rejects duplicate ids", () => {
    expect(() => createGameRegistry([specGames[0], specGames[0]])).toThrow(/Duplicate/);
  });
});

describe("production catalog", () => {
  it("is the single source of truth for the full roster", () => {
    const games = gameRegistry.list();
    expect(games.length).toBeGreaterThanOrEqual(78);
    expect(new Set(games.map((g) => g.id)).size).toBe(games.length);
    for (const g of games) expect(getCategory(g.category)).not.toBeNull();
    // Every category is populated, in menu order.
    expect(gameRegistry.groupByCategory().map((group) => group.category.id)).toEqual(GAME_CATEGORIES.map((c) => c.id));
  });

  it("only lists implemented games as available", () => {
    const available = gameRegistry.list().filter((g) => g.status === "available");
    expect(available.map((g) => g.id).sort()).toEqual(["chess", "jigsaw_puzzle", "ludo", "naija_whot", "scrabble", "tic_tac_toe", "would_you_rather"]);
    for (const g of available) {
      expect(typeof g.loadClient).toBe("function");
      expect(typeof g.loadRules).toBe("function");
    }
  });

  it("represents the locked roster, including Target Range in its future Range Room", () => {
    const range = gameRegistry.get("shooting_range");
    expect(range).toMatchObject({ name: "Target Range", category: "quick_casual", mode: "competitive", multiplayer: "realtime", maxPlayers: 2, winStreakEligible: true, space: "range_room" });
    for (const id of ["chess", "ludo", "scrabble", "naija_whot", "would_you_rather", "jigsaw_puzzle", "watch_together", "truth_or_dare"]) {
      expect(gameRegistry.has(id)).toBe(true);
    }
    // Word Association appears in Co-op and Word Games with distinct ids.
    expect(gameRegistry.get("word_association").category).toBe("word_games");
    expect(gameRegistry.get("word_association_coop").category).toBe("co_op");
  });

  it("exposes capabilities as named flags, derived from metadata (never from category)", () => {
    expect(capabilityFlags(gameRegistry.get("ludo"))).toMatchObject({ turnBased: true, realtime: false, competitive: true, winStreakEligible: true, voiceEnabled: true });
    expect(capabilityFlags(gameRegistry.get("shooting_range"))).toMatchObject({ realtime: true, timed: true, scoreBased: true, competitive: true, winStreakEligible: true });
    expect(capabilityFlags(gameRegistry.get("jigsaw_puzzle"))).toMatchObject({ cooperative: true, competitive: false, winStreakEligible: false });
    // Curated questions today — not labelled AI until the AI provider really exists.
    expect(capabilityFlags(gameRegistry.get("would_you_rather"))).toMatchObject({ conversation: true, aiGenerated: false, competitive: false, winStreakEligible: false, voiceEnabled: true });
    expect(capabilityFlags(gameRegistry.get("watch_together"))).toMatchObject({ creative: true, competitive: false, winStreakEligible: false });
    // same category, different behaviour
    expect(capabilityFlags(gameRegistry.get("rock_paper_scissors")).turnBased).toBe(true);
    expect(capabilityFlags(gameRegistry.get("reaction_challenge")).realtime).toBe(true);
  });

  it("derives routing requirements: realtime server, AI, 3D, dedicated room", () => {
    expect(gameRequirements(gameRegistry.get("shooting_range"))).toEqual({ needsRealtimeServer: true, needsAi: false, is3d: true, needsRoom: true });
    expect(gameRequirements(gameRegistry.get("tic_tac_toe"))).toEqual({ needsRealtimeServer: false, needsAi: false, is3d: false, needsRoom: false });
    expect(gameRequirements(gameRegistry.get("daily_question")).needsAi).toBe(true);
    // conversation games are event-driven: no realtime game server needed
    expect(gameRequirements(gameRegistry.get("would_you_rather")).needsRealtimeServer).toBe(false);
    expect(gameRegistry.get("would_you_rather").sessionDefaults).toEqual({ rounds: 10 });
    expect(gameRequirements(gameRegistry.get("ludo")).needsRealtimeServer).toBe(false);
  });

  it("every game has an icon and categories are unique", () => {
    for (const g of gameRegistry.list()) expect(typeof g.icon).toBe("string");
    expect(new Set(GAME_CATEGORIES.map((c) => c.id)).size).toBe(GAME_CATEGORIES.length);
    expect(new Set(GAME_CATEGORIES.map((c) => c.order)).size).toBe(GAME_CATEGORIES.length);
  });

  it("every game declares a rendering budget; heavy games get their own space", () => {
    for (const g of gameRegistry.list()) expect(["light", "medium", "heavy"]).toContain(g.performanceProfile);
    expect(gameRegistry.get("shooting_range").performanceProfile).toBe("heavy");
    expect(gameRegistry.get("tic_tac_toe").performanceProfile).toBe("light");
    expect(() => defineGame({ ...specGames[2], performanceProfile: "heavy" })).toThrow(/own space/);
  });

  it("derives win-streak eligibility from metadata, never from category alone", () => {
    const eligible = (id) => gameRegistry.get(id).winStreakEligible;
    for (const id of ["chess", "ludo", "scrabble", "shooting_range", "connect_4"]) expect(eligible(id)).toBe(true);
    for (const id of ["would_you_rather", "jigsaw_puzzle", "lobby_decor", "music_room", "watch_together"]) expect(eligible(id)).toBe(false);
    for (const g of gameRegistry.listByCategory("flirty_spicy")) {
      expect(g.winStreakEligible).toBe(false);
      expect(g.mature).toBe(true);
    }
  });
});
