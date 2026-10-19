import { describe, expect, it } from "vitest";
import { gameRegistry } from "./catalog";
import { GAME_GUIDES, guideFor } from "./guides";

describe("how-to-play guides", () => {
  it("every playable game has a guide with a goal, rules and steps", () => {
    for (const definition of gameRegistry.list().filter((game) => game.status === "available")) {
      const guide = guideFor(definition.id);
      expect(guide, definition.id).toBeTruthy();
      expect(guide.goal.length).toBeGreaterThan(10);
      expect(guide.sections.length).toBeGreaterThan(0);
      for (const section of guide.sections) expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("only describes games that exist", () => {
    for (const id of Object.keys(GAME_GUIDES)) expect(gameRegistry.get(id), id).toBeTruthy();
  });
});
