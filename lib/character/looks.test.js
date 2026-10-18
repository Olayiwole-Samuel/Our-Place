import { describe, expect, it, vi } from "vitest";

vi.mock("./gallery.manifest.json", () => ({
  default: {
    generated: "2026-10-18",
    characters: [
      { id: "male", name: "Male", file: "/models/characters/male.glb", rig: "mixamo" },
      { id: "female", name: "Female", file: "/models/characters/female.glb", rig: "mixamo" },
    ],
    animations: { mixamo: { clips: { idle: "/models/animations/mixamo/idle.glb" } } },
  },
}));

const { LOOKS, currentLook, displayedCharacter } = await import("./looks");

describe("male / female looks", () => {
  it("offers the two built characters", () => {
    expect(LOOKS.map((look) => look.id)).toEqual(["male", "female"]);
  });

  it("keeps a chosen look and shows the default look to anyone who hasn't chosen", () => {
    const chosen = { provider: "library", config: {}, model: { key: "library:female", url: "/models/characters/female.glb", rig: "mixamo" } };
    expect(currentLook(chosen)).toBe("female");
    expect(displayedCharacter(chosen)).toBe(chosen);

    const imported = { provider: "imported", config: { a: 1 }, model: { key: "u/x.glb", url: "https://signed" } };
    expect(currentLook(imported)).toBeNull();
    expect(displayedCharacter(imported).model).toEqual({ key: "library:male", url: "/models/characters/male.glb", rig: "mixamo" });
    expect(displayedCharacter(null).model.key).toBe("library:male");
  });
});
