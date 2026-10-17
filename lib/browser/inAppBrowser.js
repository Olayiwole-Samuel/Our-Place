/**
 * In-app browsers (Instagram, Facebook, TikTok, Snapchat, LINE, X/Twitter and
 * Android WebViews) — Google refuses sign-in inside them
 * ("disallowed_useragent"), so the sign-in screen asks to open the real
 * browser instead. WhatsApp and Telegram open links in the system browser, so
 * they aren't listed.
 */
const IN_APP = /(FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Bytedance|Snapchat|Line\/|Twitter|LinkedInApp|Pinterest|; wv\))/i;

export function isInAppBrowser(userAgent = globalThis.navigator?.userAgent ?? "") {
  return IN_APP.test(userAgent);
}
