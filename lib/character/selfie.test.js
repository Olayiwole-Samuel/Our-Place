import { describe, expect, it } from "vitest";
import { isMetaPersonOrigin, outgoing, parseMetaPersonMessage } from "./metapersonProtocol";
import { SELFIE_RULES, checkSelfieDimensions, checkSelfieFile, fitWithin } from "./selfie";

describe("selfie validation", () => {
  it("accepts sensible photos only", () => {
    expect(checkSelfieFile({ type: "image/jpeg", size: 500_000 })).toBeNull();
    expect(checkSelfieFile({ type: "image/gif", size: 500_000 })).toBe("type");
    expect(checkSelfieFile({ type: "image/svg+xml", size: 500_000 })).toBe("type");
    expect(checkSelfieFile({ type: "image/png", size: SELFIE_RULES.maxBytes + 1 })).toBe("too_large");
    expect(checkSelfieFile({ type: "image/png", size: 100 })).toBe("too_small");
    expect(checkSelfieFile(null)).toBe("missing");
  });

  it("checks dimensions", () => {
    expect(checkSelfieDimensions(1080, 1440)).toBeNull();
    expect(checkSelfieDimensions(300, 300)).toBe("low_resolution");
    expect(checkSelfieDimensions(8000, 6000)).toBe("too_large");
    expect(checkSelfieDimensions(0, 0)).toBe("unreadable");
  });

  it("downscales for upload without distorting", () => {
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });
});

describe("MetaPerson protocol", () => {
  const msg = (origin, data) => ({ origin, data: { source: "metaperson_creator", ...data } });

  it("only trusts MetaPerson's origins", () => {
    expect(isMetaPersonOrigin("https://metaperson.avatarsdk.com")).toBe(true);
    expect(isMetaPersonOrigin("https://evil.example")).toBe(false);
    expect(parseMetaPersonMessage(msg("https://evil.example", { eventName: "model_exported", url: "https://x" }))).toBeNull();
  });

  it("drops the source photo from model_generated", () => {
    const parsed = parseMetaPersonMessage(
      msg("https://metaperson.avatarsdk.com", { eventName: "model_generated", avatarCode: "abc", photoUrl: "https://p", photoBytes: [1, 2, 3] }),
    );
    expect(parsed).toEqual({ type: "generated", avatarCode: "abc" });
  });

  it("parses exports and ignores malformed messages", () => {
    expect(
      parseMetaPersonMessage(msg("https://mobile.metaperson.avatarsdk.com", { eventName: "model_exported", url: "https://e/a.glb", avatarCode: "c", avatarState: "{}" })),
    ).toEqual({ type: "exported", url: "https://e/a.glb", avatarCode: "c", avatarState: "{}" });
    expect(parseMetaPersonMessage(msg("https://metaperson.avatarsdk.com", { eventName: "model_exported" }))).toBeNull();
    expect(parseMetaPersonMessage({ origin: "https://metaperson.avatarsdk.com", data: "hello" })).toBeNull();
  });

  it("authenticates with a token, never a client secret", () => {
    const message = outgoing.authenticate("tok");
    expect(message).toEqual({ eventName: "authenticate", accessToken: "tok" });
    expect(JSON.stringify(message)).not.toMatch(/clientSecret|clientId/);
  });

  it("requests full-body GLB exports", () => {
    expect(outgoing.exportParameters()).toMatchObject({ format: "glb", headOnly: "false" });
  });
});
