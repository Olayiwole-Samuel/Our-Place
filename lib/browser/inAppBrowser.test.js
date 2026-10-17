import { describe, expect, it } from "vitest";
import { isInAppBrowser } from "./inAppBrowser";

describe("in-app browser detection", () => {
  it("flags Instagram, Facebook, TikTok and Android WebViews", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 13) [FBAN/EMA;FBLC/en_US]")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 12; wv) musical_ly_2022")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 13; SM-A135F; wv) AppleWebKit/537.36 Version/4.0 Chrome/120 Mobile")).toBe(true);
  });

  it("leaves real browsers alone", () => {
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});
