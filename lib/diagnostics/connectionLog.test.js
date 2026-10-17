// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { connectionLog, formatConnectionLog, logConnection, subscribeConnectionLog } from "./connectionLog";

describe("connection log", () => {
  it("records events, notifies listeners, keeps only the latest entries and survives a reload (sessionStorage)", () => {
    let calls = 0;
    const stop = subscribeConnectionLog(() => (calls += 1));
    logConnection("presence", "subscribed");
    expect(calls).toBe(1);
    stop();
    for (let i = 0; i < 100; i += 1) logConnection("socket", `heartbeat timeout ${i}`);
    const entries = connectionLog();
    expect(entries.length).toBe(80);
    expect(entries.at(-1).event).toBe("heartbeat timeout 99");
    expect(JSON.parse(sessionStorage.getItem("our-place:connection-log")).length).toBe(80);
  });

  it("formats plain text for pasting, with the device line", () => {
    const text = formatConnectionLog([{ at: Date.UTC(2026, 9, 17, 10, 4, 5), area: "voice", event: "reconnecting" }], { userAgent: "Phone", online: true, visible: "visible" });
    expect(text).toContain("Device: Phone");
    expect(text).toContain("10:04:05 voice    reconnecting");
  });
});
