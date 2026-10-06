import { METAPERSON_EXPORT_PARAMETERS, METAPERSON_ORIGINS } from "./providers";

/**
 * MetaPerson Creator postMessage protocol (documented JS API), isolated so the
 * rest of the app never handles provider messages directly.
 *
 * Security:
 *  - incoming messages are accepted only from MetaPerson's own origins
 *  - outgoing messages are sent to the iframe's exact origin, never "*"
 *  - authentication uses a short-lived access token minted by our server;
 *    the client secret never reaches the browser
 *  - events that carry the source photo (model_generated) are reduced to the
 *    fields we need — the photo bytes/URL are dropped immediately
 */
export function isMetaPersonOrigin(origin) {
  return METAPERSON_ORIGINS.includes(origin);
}

export const outgoing = {
  authenticate: (accessToken) => ({ eventName: "authenticate", accessToken }),
  uiParameters: ({ mobile }) =>
    mobile
      ? {
          eventName: "set_ui_parameters",
          theme: "dark",
          isLoginButtonVisible: false,
          isHomeButtonVisible: false,
          isExportButtonVisible: true,
          exportButtonText: "Use this character",
        }
      : {
          eventName: "set_ui_parameters",
          isExportButtonVisible: true,
          closeExportDialogWhenExportCompleted: true,
          isLanguageSelectionVisible: false,
          showLatestCreatedAvatar: false,
          isTakeSelfieButtonVisible: false,
          isBrowsePhotoButtonVisible: false,
          showSampleAvatars: false,
          isGifButtonVisible: false,
          isPngButtonVisible: false,
        },
  exportParameters: () => ({ ...METAPERSON_EXPORT_PARAMETERS }),
  generate: ({ imageBase64, bodyType }) => ({
    eventName: "generate_avatar",
    gender: bodyType === "masculine" ? "male" : "female",
    age: "adult",
    image: imageBase64,
  }),
  exportAvatar: () => ({ eventName: "export_avatar" }),
};

/**
 * Parses a window message. Returns a sanitised event or null (wrong origin,
 * unknown shape). Never returns photo data.
 */
export function parseMetaPersonMessage(event) {
  if (!event || !isMetaPersonOrigin(event.origin)) return null;
  const data = event.data;
  if (!data || typeof data !== "object" || data.source !== "metaperson_creator" || typeof data.eventName !== "string") return null;
  switch (data.eventName) {
    case "metaperson_creator_loaded":
      return { type: "loaded" };
    case "authentication_status":
      return { type: "authenticated", ok: data.isAuthenticated === true };
    case "model_generated":
      return { type: "generated", avatarCode: String(data.avatarCode ?? "") };
    case "model_exported":
      if (typeof data.url !== "string") return null;
      return {
        type: "exported",
        url: data.url,
        avatarCode: typeof data.avatarCode === "string" ? data.avatarCode : null,
        avatarState: typeof data.avatarState === "string" ? data.avatarState : null,
      };
    case "action_availability_changed":
      return { type: "availability", actionName: String(data.actionName ?? ""), available: data.isAvailable === true };
    default:
      return null;
  }
}
