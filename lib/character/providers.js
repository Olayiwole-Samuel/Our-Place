/**
 * Avatar provider boundary (client-safe description).
 *
 *   Our Place → character system → provider adapter → provider
 *
 * The app asks for capabilities and gets back an Our Place character; it never
 * reads a provider's payloads. Server-side adapter operations live in
 * lib/character/metaperson.server.js (and future *.server.js adapters):
 *   getAccessToken()      short-lived provider token, minted server-side
 *   importExport(...)     download → validate full-body GLB → private storage → character
 *
 * Capabilities below were verified against the providers' documentation (see
 * docs/characters.md). Nothing is claimed that isn't implemented.
 */
export const PROVIDERS = Object.freeze({
  ourplace: {
    id: "ourplace",
    name: "Our Place studio",
    fromPhoto: false,
    fullBody: true,
    rigged: true,
    // Live, in-app customisation of the built-in character.
    customization: ["face", "body", "hair", "clothes", "accessories"],
    liveCustomization: true,
    format: "procedural skinned mesh",
  },
  metaperson: {
    id: "metaperson",
    name: "MetaPerson",
    fromPhoto: true,
    fullBody: true, // verified per model on import (lib/character/glb.js)
    rigged: true, // humanoid, Mixamo-compatible skeleton
    // Face, hair, outfits and body are customised inside MetaPerson Creator
    // before export; Our Place stores the exported model.
    customization: ["provider-editor"],
    liveCustomization: false,
    format: "glb",
  },
});

export function getCharacterCapabilities(providerId) {
  return PROVIDERS[providerId] ?? PROVIDERS.ourplace;
}

/** MetaPerson Creator iframe origins (desktop + mobile builds). */
export const METAPERSON_ORIGINS = Object.freeze(["https://metaperson.avatarsdk.com", "https://mobile.metaperson.avatarsdk.com"]);
export const METAPERSON_IFRAME = Object.freeze({
  desktop: "https://metaperson.avatarsdk.com/iframe.html",
  mobile: "https://mobile.metaperson.avatarsdk.com/generator",
});

/** Export settings for real-time use: single GLB, lighter LOD, 1K textures. */
export const METAPERSON_EXPORT_PARAMETERS = Object.freeze({
  eventName: "set_export_parameters",
  format: "glb",
  lod: 2,
  textureProfile: "1K.jpg",
  useZip: false,
  headOnly: "false",
});
