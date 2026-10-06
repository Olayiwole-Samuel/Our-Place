/**
 * Selfie validation and preparation (browser).
 *
 * The selfie is only a starting point for the provider — never part of the
 * user's persistent identity. It is prepared in the browser (downscaled JPEG,
 * EXIF/location data dropped by re-encoding) and sent straight to the avatar
 * provider. Our Place never uploads, stores or logs it.
 */
export const SELFIE_RULES = Object.freeze({
  types: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 8 * 1024 * 1024,
  minSide: 480,
  maxSide: 6000,
  outputMaxSide: 1024,
  outputQuality: 0.9,
});

/** Checks a picked file before decoding it. Returns null or an error code. */
export function checkSelfieFile(file) {
  if (!file) return "missing";
  if (!SELFIE_RULES.types.includes(file.type)) return "type";
  if (file.size > SELFIE_RULES.maxBytes) return "too_large";
  if (file.size < 10 * 1024) return "too_small";
  return null;
}

/** Checks decoded dimensions. Returns null or an error code. */
export function checkSelfieDimensions(width, height) {
  if (!width || !height) return "unreadable";
  if (Math.min(width, height) < SELFIE_RULES.minSide) return "low_resolution";
  if (Math.max(width, height) > SELFIE_RULES.maxSide) return "too_large";
  return null;
}

export const SELFIE_ERRORS = Object.freeze({
  missing: "Choose a photo to continue.",
  type: "Use a JPEG, PNG or WebP photo.",
  too_large: "That photo is too large. Try one under 8 MB.",
  too_small: "That photo is too small. Try a clearer one.",
  low_resolution: "That photo is too small. Try one at least 480 pixels across.",
  unreadable: "We couldn't read that photo. Try another one.",
  camera_denied: "Camera access is off. You can allow it in your browser settings, or choose a photo instead.",
  camera_unavailable: "We couldn't start the camera. Choose a photo instead.",
});

/** Fits (width, height) inside maxSide, keeping aspect ratio. */
export function fitWithin(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Draws an image/video source to a canvas and returns a base64 JPEG (no data:
 * prefix), downscaled for upload. Mirrors front-camera captures back to
 * true orientation when `mirror` is set.
 */
export function encodeSelfie(source, sourceWidth, sourceHeight, { mirror = false } = {}) {
  const { width, height } = fitWithin(sourceWidth, sourceHeight, SELFIE_RULES.outputMaxSide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", SELFIE_RULES.outputQuality);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), previewUrl: dataUrl, width, height };
}
