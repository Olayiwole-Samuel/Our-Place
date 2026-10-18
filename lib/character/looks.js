import { GALLERY_MODELS, galleryModelDescriptor } from "./gallery";

/**
 * The characters everyone chooses between: one male and one female, realistic
 * and fully animated (Mixamo, built by scripts/build-mixamo.mjs). Nobody designs
 * or imports a personal character any more; you pick a look, and can switch it
 * any time from the world.
 *
 * Until the models are built (an empty gallery) LOOKS is empty and characters
 * render exactly as before.
 */
export const LOOKS = Object.freeze(GALLERY_MODELS.filter((model) => model.id === "male" || model.id === "female"));
export const DEFAULT_LOOK = "male";

const lookIds = new Set(LOOKS.map((look) => look.id));

/** The look this character uses, or null (not chosen yet). */
export function currentLook(character) {
  if (character?.provider !== "library") return null;
  const id = character.model?.key?.replace(/^library:/, "");
  return lookIds.has(id) ? id : null;
}

/** What to render for a person: their look, or the default look until they choose. */
export function displayedCharacter(character, fallback = DEFAULT_LOOK) {
  if (!LOOKS.length) return character;
  if (currentLook(character)) return character;
  const id = lookIds.has(fallback) ? fallback : LOOKS[0].id;
  return { ...(character ?? {}), config: character?.config, model: galleryModelDescriptor(id) };
}
