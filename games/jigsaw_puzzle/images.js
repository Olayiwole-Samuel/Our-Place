/**
 * Pictures a puzzle can be made from — the server only stores the id.
 *   builtin:*   illustrations shipped with the app (public/puzzles, drawn for Our Place)
 *   photo:*     the couple's own "together" photos (private storage). Each
 *               player's browser loads them with ITS OWN short-lived signed URL
 *               (GET /api/couple/photos) — the server never makes them public.
 */
export const BUILTIN_IMAGES = Object.freeze([
  { id: "builtin:lagos_sunset", name: "Lagos sunset", src: "/puzzles/lagos-sunset.svg" },
  { id: "builtin:night_sky", name: "Night sky", src: "/puzzles/night-sky.svg" },
  { id: "builtin:tropical", name: "Tropical garden", src: "/puzzles/tropical.svg" },
  { id: "builtin:hearts", name: "Hearts", src: "/puzzles/hearts.svg" },
]);

export const PHOTO_IMAGES = Object.freeze([
  { id: "photo:together_a", name: "Our photo (1)", slot: "togetherA" },
  { id: "photo:together_b", name: "Our photo (2)", slot: "togetherB" },
]);

export const IMAGE_IDS = Object.freeze([...BUILTIN_IMAGES, ...PHOTO_IMAGES].map((image) => image.id));
