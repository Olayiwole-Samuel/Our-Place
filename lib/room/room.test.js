import { describe, expect, it } from "vitest";
import { lastSeenText } from "@/store/roomStore";
import { milestones } from "@/components/lobby/room/ShelfPanel";
import { expectedPosition, formatTime, needsSeek, parseYouTube, videoTypeOf } from "./watch";

describe("YouTube links", () => {
  it("reads the video id from every common link shape", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ]) {
      expect(parseYouTube(link), link).toBe("dQw4w9WgXcQ");
    }
  });

  it("refuses anything else", () => {
    for (const link of ["", "hello", "https://vimeo.com/123", "https://youtube.com/watch?v=short", "javascript:alert(1)"]) expect(parseYouTube(link)).toBeNull();
  });
});

describe("watch-together sync", () => {
  const at = Date.parse("2026-10-20T20:00:00Z");
  it("a playing TV moves on with the server's clock; a paused one stays put", () => {
    const watch = { source: { type: "youtube", id: "x" }, playing: true, atSeconds: 100, updatedAt: "2026-10-20T20:00:00Z" };
    expect(expectedPosition(watch, { now: at + 30_000 })).toBe(130);
    expect(expectedPosition({ ...watch, playing: false }, { now: at + 30_000 })).toBe(100);
    // A phone whose clock is 5 s behind the server still lands on the same moment.
    expect(expectedPosition(watch, { now: at + 25_000, skewMs: 5_000 })).toBe(130);
    expect(expectedPosition(null)).toBe(0);
  });

  it("only corrects players that drifted noticeably", () => {
    expect(needsSeek(100.4, 100)).toBe(false);
    expect(needsSeek(103, 100)).toBe(true);
  });

  it("formats times and recognises video files", () => {
    expect([formatTime(42), formatTime(725), formatTime(3753)]).toEqual(["0:42", "12:05", "1:02:33"]);
    expect(videoTypeOf({ type: "", name: "Movie.MKV" })).toBe("video/x-matroska");
    expect(videoTypeOf({ type: "video/mp4", name: "x" })).toBe("video/mp4");
    expect(videoTypeOf({ type: "application/pdf", name: "a.pdf" })).toBeNull();
  });
});

describe("last seen and milestones", () => {
  const now = Date.parse("2026-10-20T20:00:00Z");
  it("says when your partner was last here in plain words", () => {
    expect(lastSeenText("2026-10-20T19:59:30Z", now)).toBe("just now");
    expect(lastSeenText("2026-10-20T19:40:00Z", now)).toBe("20 min ago");
    expect(lastSeenText("2026-10-20T15:00:00Z", now)).toBe("5 h ago");
    expect(lastSeenText("2026-10-19T12:00:00Z", now)).toBe("yesterday");
    expect(lastSeenText(null)).toBeNull();
  });

  it("unlocks milestones from the couple's real numbers", () => {
    const unlocked = (stats) => milestones({ daysTogether: 0, bestStreak: 0, gamesPlayed: 0, puzzles: 0, memories: 0, notes: 0, messages: 0, ...stats }).filter((m) => m.unlocked).map((m) => m.id);
    expect(unlocked({})).toEqual(["paired"]);
    expect(unlocked({ daysTogether: 40, bestStreak: 8, messages: 150 })).toEqual(expect.arrayContaining(["week", "month", "streak3", "streak7", "chat100"]));
    expect(unlocked({ daysTogether: 40 })).not.toContain("year");
  });
});
