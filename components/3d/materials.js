import * as THREE from "three";
import { palette } from "@/lib/design/tokens";

/**
 * The living room's material library. Every colour is the identity palette or a
 * blend of two palette colours — no new hues. Materials are shared instances
 * (one per surface type), which keeps shader programs and GPU state changes low
 * on mobile.
 *
 * Art direction: dark wood and black metal as the foundation, army-green
 * upholstery and plants, soft-white textiles, pink only on couple details, sky
 * blue only on screens and live/play objects.
 */

/** Blend two palette colours (t = 0 → a, 1 → b). */
export function mix(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

const standard = (color, props = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...props });

let library = null;

export function getMaterials() {
  if (library) return library;
  library = {
    // Architecture
    floor: standard(palette.white, { map: plankTexture(), roughness: 0.62 }),
    wall: standard(mix(palette.black700, palette.green700, 0.28), { roughness: 0.95 }),
    wainscot: standard(mix(palette.black800, palette.green700, 0.42), { roughness: 0.8 }),
    trim: standard(palette.black900, { roughness: 0.6 }),
    ceiling: standard(palette.black800, { roughness: 1 }),

    // Furniture
    darkWood: standard(mix(palette.black800, palette.black700, 0.5), { roughness: 0.55 }),
    blackMetal: standard(palette.black950, { roughness: 0.35, metalness: 0.6 }),
    upholstery: standard(palette.green600, { roughness: 0.95 }),
    upholsteryDeep: standard(palette.green700, { roughness: 0.95 }),
    cushionPink: standard(palette.pink400, { roughness: 0.9 }),
    textile: standard(mix(palette.textSecondary, palette.whiteSoft, 0.5), { roughness: 1 }),
    rug: standard(palette.white, { map: rugTexture(), roughness: 1 }),
    ceramic: standard(palette.black900, { roughness: 0.4 }),
    leaf: standard(palette.green500, { roughness: 0.8, side: THREE.DoubleSide }),
    leafDeep: standard(palette.green700, { roughness: 0.8, side: THREE.DoubleSide }),
    soil: standard(palette.black950, { roughness: 1 }),
    paper: standard(palette.whiteSoft, { roughness: 0.9 }),
    feltGreen: standard(palette.green700, { roughness: 1 }),
    bookGreen: standard(palette.green600, { roughness: 0.8 }),
    bookPink: standard(palette.pink500, { roughness: 0.8 }),
    bookWhite: standard(palette.textSecondary, { roughness: 0.8 }),
    bookBlack: standard(palette.black700, { roughness: 0.8 }),
    brass: standard(palette.textSecondary, { roughness: 0.3, metalness: 0.8 }),

    // Emissive (cheap "lights" that don't cost a light)
    lampShade: new THREE.MeshStandardMaterial({
      color: palette.whiteSoft,
      emissive: mix(palette.whiteSoft, palette.pink400, 0.25),
      emissiveIntensity: 0.9,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    screenIdle: new THREE.MeshBasicMaterial({ color: mix(palette.black950, palette.blue600, 0.12) }),
    liveGlow: new THREE.MeshBasicMaterial({ color: palette.blue400 }),
    heartGlow: new THREE.MeshBasicMaterial({ color: palette.pink400 }),
  };
  return library;
}

// ── Procedural textures (no downloads) ─────────────────────────────────────

function canvasTexture(width, height, draw, { repeat = [1, 1], srgb = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
}

/** Dark wood planks: narrow boards in close tones of the black palette, fine seams. */
function plankTexture() {
  const tones = [mix(palette.black700, palette.green700, 0.08), mix(palette.black800, palette.black700, 0.75), palette.black700, mix(palette.black700, palette.green700, 0.04)];
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const rows = 8; // with repeat [4, 8]: ~12 cm wide, ~1.1 m long boards
      for (let row = 0; row < rows; row++) {
        const offset = (row % 2) * (w / 2);
        for (let col = -1; col < 2; col++) {
          const tone = tones[(row * 3 + col + 3) % tones.length];
          ctx.fillStyle = `#${new THREE.Color(tone).getHexString()}`;
          ctx.fillRect(col * w * 0.5 + offset, row * (h / rows), w / 2, h / rows);
        }
        ctx.fillStyle = `#${mix(palette.black950, palette.black800, 0.4).getHexString()}`;
        ctx.fillRect(0, row * (h / rows), w, 1);
      }
    },
    { repeat: [4, 8] },
  );
}

/** Soft-white rug with an army-green border and a thin pink inner line. */
function rugTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = `#${mix(palette.textSecondary, palette.whiteSoft, 0.4).getHexString()}`;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = palette.green600;
    ctx.lineWidth = 22;
    ctx.strokeRect(11, 11, w - 22, h - 22);
    ctx.strokeStyle = palette.pink400;
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, w - 60, h - 60);
  });
}

let blobTexture = null;
/** Radial soft shadow used under avatars and furniture instead of shadow maps. */
export function getBlobShadowTexture() {
  if (blobTexture) return blobTexture;
  blobTexture = canvasTexture(
    128,
    128,
    (ctx, w) => {
      const gradient = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gradient.addColorStop(0, "rgba(0,0,0,0.55)");
      gradient.addColorStop(0.6, "rgba(0,0,0,0.22)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, w);
    },
    { srgb: false },
  );
  return blobTexture;
}

/**
 * Crisp in-world text (empty states, name tags) drawn to a canvas texture.
 * Uses the page's own font stack, so it matches the UI without loading a font file.
 */
export function createTextTexture(lines, { width = 512, height = 128, color = palette.textSecondary, background = null, align = "center" } = {}) {
  const fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
  return canvasTexture(width, height, (ctx, w, h) => {
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const lineHeight = h / (lines.length + 0.5);
    lines.forEach((line, i) => {
      ctx.font = `${line.weight ?? 500} ${line.size ?? 40}px ${fontFamily}`;
      ctx.fillStyle = line.color ?? color;
      ctx.fillText(line.text, align === "center" ? w / 2 : 16, lineHeight * (i + 0.75));
    });
  });
}
