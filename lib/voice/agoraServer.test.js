import { describe, expect, it } from "vitest";
import { agoraConfig, coupleChannelName, createAgoraAccess } from "./agora.server";

const ENV = { AGORA_APP_ID: "0123456789abcdef0123456789abcdef", AGORA_APP_CERTIFICATE: " \"fedcba9876543210fedcba9876543210\" " };

describe("Agora server credentials", () => {
  it("needs both a 32-hex App ID and certificate (pasted quotes and spaces are fine)", () => {
    expect(agoraConfig({})).toBeNull();
    expect(agoraConfig({ AGORA_APP_ID: ENV.AGORA_APP_ID })).toBeNull();
    expect(agoraConfig(ENV)).toEqual({ appId: ENV.AGORA_APP_ID, certificate: "fedcba9876543210fedcba9876543210" });
  });

  it("gives each couple its own unguessable channel and a token for the caller only", () => {
    const access = createAgoraAccess({ coupleId: "couple-1", userId: "user-1", env: ENV, now: () => 0 });
    expect(access).toMatchObject({ appId: ENV.AGORA_APP_ID, uid: "user-1", channel: coupleChannelName("couple-1", "fedcba9876543210fedcba9876543210") });
    expect(access.channel).toMatch(/^op-[0-9a-f]{32}$/);
    expect(access.channel).not.toBe(createAgoraAccess({ coupleId: "couple-2", userId: "user-1", env: ENV }).channel);
    expect(access.token).toMatch(/^007/);
    expect(JSON.stringify(access)).not.toContain("fedcba9876543210fedcba9876543210");
  });
});
