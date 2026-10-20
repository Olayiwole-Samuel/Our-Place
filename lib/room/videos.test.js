import { describe, expect, it } from "vitest";
import { videoStorageConfig } from "./videos.server";

describe("video storage config", () => {
  it("needs all four Backblaze values and a real B2 endpoint", () => {
    expect(videoStorageConfig({})).toBeNull();
    expect(videoStorageConfig({ B2_KEY_ID: "k", B2_APPLICATION_KEY: "s", B2_BUCKET: "b", B2_ENDPOINT: "example.com" })).toBeNull();
    expect(videoStorageConfig({ B2_KEY_ID: " k ", B2_APPLICATION_KEY: '"s"', B2_BUCKET: "our-videos", B2_ENDPOINT: "https://s3.us-east-005.backblazeb2.com/" })).toEqual({
      keyId: "k",
      secret: "s",
      bucket: "our-videos",
      endpoint: "s3.us-east-005.backblazeb2.com",
      region: "us-east-005",
    });
  });
});
