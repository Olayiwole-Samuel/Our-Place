import { describe, expect, it, vi } from "vitest";
import { AppError, ERROR_CATEGORY, presentError, reportError } from "./errors";
import { COUPLE_CHANNEL, coupleChannelName } from "./realtime/channels";

describe("errors", () => {
  it("presents categorized errors with human copy and a recovery hint", () => {
    const presented = presentError(new AppError(ERROR_CATEGORY.MULTIPLAYER));
    expect(presented).toMatchObject({ category: "multiplayer", recovery: "retry" });
    expect(presented.title).toBeTruthy();
  });

  it("never exposes raw messages from unknown errors", () => {
    const presented = presentError(new Error("relation \"couples\" does not exist"));
    expect(presented.category).toBe("unknown");
    expect(JSON.stringify(presented)).not.toContain("couples");
  });

  it("logs instead of swallowing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new AppError(ERROR_CATEGORY.DATABASE, { context: { table: "messages" } }));
    expect(spy).toHaveBeenCalledWith("[our-place:database]", expect.any(AppError), { table: "messages" });
    spy.mockRestore();
  });
});

describe("realtime channels", () => {
  const coupleId = "2f1c0a9e-6a8b-4c3d-9e2f-1a2b3c4d5e6f";

  it("namespaces every channel by couple", () => {
    expect(coupleChannelName(coupleId, COUPLE_CHANNEL.CHAT)).toBe(`our-place:couple:${coupleId}:chat`);
  });

  it("rejects non-UUID couple ids and unknown channels", () => {
    expect(() => coupleChannelName("*", COUPLE_CHANNEL.CHAT)).toThrow();
    expect(() => coupleChannelName(coupleId, "game")).toThrow();
  });
});
