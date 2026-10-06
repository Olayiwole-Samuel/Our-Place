import { describe, expect, it } from "vitest";
import { BODY_RANGES, HAIRSTYLES, ITEMS, ITEMS_BY_ID, SKIN_TONES, STUDIO_CATEGORIES, itemsForSlot } from "./catalog";
import { DEFAULT_CHARACTER, STARTING_LOOKS, applyCharacterPatch, bodyDimensions, normalizeCharacterConfig, sameCharacter } from "./schema";

describe("character catalog", () => {
  it("has unique ids and valid default colours for every item", () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
    for (const item of ITEMS) expect(item.colors.length, item.id).toBeGreaterThan(0);
  });

  it("offers real choice in every studio category", () => {
    expect(STUDIO_CATEGORIES.map((c) => c.id)).toEqual(["face", "body", "hair", "clothes", "accessories"]);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(8);
    expect(HAIRSTYLES.length).toBeGreaterThanOrEqual(10);
    for (const slot of ["top", "bottom", "shoes", "glasses", "hat"]) expect(itemsForSlot(slot).length, slot).toBeGreaterThan(1);
  });
});

describe("normalizeCharacterConfig", () => {
  it("fills a complete, valid default from nothing", () => {
    const config = normalizeCharacterConfig(undefined);
    expect(config).toEqual(normalizeCharacterConfig(DEFAULT_CHARACTER));
    expect(config.version).toBe(1);
  });

  it("clamps body proportions to the safe range (no 999 m giants)", () => {
    const config = normalizeCharacterConfig({ body: { height: 999, build: -5, shoulders: "wide" } });
    expect(config.body).toEqual({ height: 1, build: 0, shoulders: DEFAULT_CHARACTER.body.shoulders });
    const dims = bodyDimensions({ body: { height: 999 } });
    expect(dims.height).toBe(BODY_RANGES.height.max);
  });

  it("rejects unknown ids, wrong-slot items and injected fields", () => {
    const config = normalizeCharacterConfig({
      skin: { tone: "<script>" },
      hair: { style: "mohawk-9000", color: "neon" },
      outfit: { top: "sneakers", bottom: "jeans", shoes: "hoodie" },
      accessories: { hat: "glasses_round" },
      model_url: "https://evil.example/a.glb",
      user_id: "someone-else",
    });
    expect(config.skin.tone).toBe(DEFAULT_CHARACTER.skin.tone);
    expect(config.hair).toEqual(DEFAULT_CHARACTER.hair);
    expect(config.outfit.top).toBe(DEFAULT_CHARACTER.outfit.top);
    expect(config.outfit.bottom).toBe("jeans");
    expect(config.outfit.shoes).toBe(DEFAULT_CHARACTER.outfit.shoes);
    expect(config.accessories.hat).toBeNull();
    expect(config).not.toHaveProperty("model_url");
    expect(config).not.toHaveProperty("user_id");
  });

  it("a full outfit replaces top and bottom; removing it restores them", () => {
    const dressed = applyCharacterPatch(DEFAULT_CHARACTER, { outfit: { outfit: "dress" } });
    expect(dressed.outfit).toMatchObject({ outfit: "dress", top: null, bottom: null });
    const back = applyCharacterPatch(dressed, { outfit: { outfit: null } });
    expect(back.outfit.top).toBeTruthy();
    expect(back.outfit.bottom).toBeTruthy();
  });

  it("shoes are always worn", () => {
    expect(normalizeCharacterConfig({ outfit: { shoes: null } }).outfit.shoes).toBeTruthy();
  });

  it("gives every equipped item a colour that item offers", () => {
    const config = normalizeCharacterConfig({ outfit: { top: "tee" }, colors: { top: "denim" } });
    expect(ITEMS_BY_ID.get("tee").colors).toContain(config.colors.top);
    expect(config.colors.top).toBe("white"); // denim isn't offered for tees → item default
  });

  it("refuses locked reward items", () => {
    // Simulate a future reward item by checking the rule directly on the catalog contract.
    const locked = { ...ITEMS_BY_ID.get("cap"), id: "reward_cap", unlock: { type: "achievement", id: "ten_wins" } };
    ITEMS_BY_ID.set(locked.id, locked);
    try {
      expect(normalizeCharacterConfig({ accessories: { hat: "reward_cap" } }).accessories.hat).toBeNull();
    } finally {
      ITEMS_BY_ID.delete(locked.id);
    }
  });

  it("every starting look is valid and distinct", () => {
    const looks = STARTING_LOOKS.map((look) => applyCharacterPatch(DEFAULT_CHARACTER, look.patch));
    for (let i = 0; i < looks.length; i++) {
      for (let j = i + 1; j < looks.length; j++) expect(sameCharacter(looks[i], looks[j])).toBe(false);
    }
  });

  it("detects unsaved changes", () => {
    expect(sameCharacter(DEFAULT_CHARACTER, normalizeCharacterConfig(DEFAULT_CHARACTER))).toBe(true);
    expect(sameCharacter(DEFAULT_CHARACTER, applyCharacterPatch(DEFAULT_CHARACTER, { hair: { color: "pink" } }))).toBe(false);
  });
});
