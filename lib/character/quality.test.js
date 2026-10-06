import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEXTURE_RELEASE_DELAY_MS, applyModelQuality, textureUsers } from "./quality";

/** A model "as loaded": shared textures (small enough that LOW reuses the colour map as-is). */
function loadedModel() {
  const tex = (name) => {
    const texture = new THREE.Texture({ width: 256, height: 256 });
    texture.name = name;
    texture.dispose = vi.fn();
    return texture;
  };
  return { map: tex("map"), normalMap: tex("normal"), roughnessMap: tex("roughness"), aoMap: tex("ao") };
}

/** An avatar instance: its own material copy, sharing the model's textures (as modelCache does). */
function avatar(textures) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ ...textures })));
  return root;
}

const materialOf = (root) => root.children[0].material;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("avatar quality: what each tier draws with", () => {
  it("HIGH keeps every authored map; MEDIUM drops AO; LOW keeps only the colour map with Lambert shading", () => {
    const t = loadedModel();
    const root = avatar(t);
    const high = applyModelQuality(root, "high");
    expect(materialOf(root)).toMatchObject({ map: t.map, normalMap: t.normalMap, aoMap: t.aoMap });
    high();
    const medium = applyModelQuality(root, "medium");
    expect(materialOf(root)).toMatchObject({ map: t.map, normalMap: t.normalMap, aoMap: null });
    medium();
    const low = applyModelQuality(root, "low", { textureMax: 512 });
    expect(materialOf(root).isMeshLambertMaterial).toBe(true);
    expect(materialOf(root).map).toBe(t.map);
    expect(materialOf(root).normalMap ?? null).toBeNull();
    low();
    expect(materialOf(root).isMeshStandardMaterial).toBe(true); // authored material restored
  });
});

describe("GPU texture lifecycle", () => {
  it("HIGH → LOW releases the maps LOW no longer draws with — after a delay", () => {
    const t = loadedModel();
    const root = avatar(t);
    const restoreHigh = applyModelQuality(root, "high");
    restoreHigh();
    const restoreLow = applyModelQuality(root, "low", { textureMax: 512 });
    vi.advanceTimersByTime(TEXTURE_RELEASE_DELAY_MS - 1);
    expect(t.normalMap.dispose).not.toHaveBeenCalled(); // not yet: absorbs quick flip-flops
    vi.advanceTimersByTime(1);
    for (const unused of [t.normalMap, t.roughnessMap, t.aoMap]) expect(unused.dispose).toHaveBeenCalledTimes(1);
    expect(t.map.dispose).not.toHaveBeenCalled(); // still drawn by LOW
    restoreLow();
  });

  it("never releases a texture another avatar is still drawing with", () => {
    const t = loadedModel();
    const local = avatar(t);
    const partner = avatar(t);
    applyModelQuality(local, "high");
    const partnerHigh = applyModelQuality(partner, "high");
    expect(textureUsers(t.normalMap)).toBe(2);
    partnerHigh(); // partner leaves
    vi.advanceTimersByTime(TEXTURE_RELEASE_DELAY_MS * 3);
    for (const texture of Object.values(t)) expect(texture.dispose).not.toHaveBeenCalled();
    expect(textureUsers(t.normalMap)).toBe(1);
  });

  it("a quick LOW → HIGH flip-flop releases nothing (no re-upload, no flash)", () => {
    const t = loadedModel();
    const root = avatar(t);
    applyModelQuality(root, "high")();
    const low = applyModelQuality(root, "low", { textureMax: 512 });
    vi.advanceTimersByTime(1000);
    low();
    applyModelQuality(root, "high");
    vi.advanceTimersByTime(TEXTURE_RELEASE_DELAY_MS * 3);
    for (const texture of Object.values(t)) expect(texture.dispose).not.toHaveBeenCalled();
  });

  it("leaving (all avatars gone) eventually releases everything; restoring twice is harmless", () => {
    const t = loadedModel();
    const root = avatar(t);
    const restore = applyModelQuality(root, "medium");
    restore();
    restore();
    vi.advanceTimersByTime(TEXTURE_RELEASE_DELAY_MS);
    for (const texture of [t.map, t.normalMap, t.roughnessMap]) expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(textureUsers(t.map)).toBe(0);
  });

  it("re-entering the room doesn't accumulate references", () => {
    const t = loadedModel();
    for (let visit = 0; visit < 10; visit += 1) {
      const root = avatar(t);
      const restore = applyModelQuality(root, "high");
      expect(textureUsers(t.map)).toBe(1);
      restore();
    }
    expect(textureUsers(t.map)).toBe(0);
  });
});
