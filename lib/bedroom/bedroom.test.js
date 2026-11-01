import { describe, expect, it } from "vitest";
import { STAR_MS, STAR_WINDOW_MS, WISH_MS, goodnightTonight, nightOf, skyAt, sleepSoundNow, starInWindow } from "./night";

describe("the night", () => {
  it("runs noon to noon in Lagos, so 1 a.m. is still tonight", () => {
    expect(nightOf(Date.UTC(2026, 10, 1, 21))).toBe("2026-11-01"); // 22:00 Lagos
    expect(nightOf(Date.UTC(2026, 10, 2, 0))).toBe("2026-11-01"); // 01:00 Lagos
    expect(nightOf(Date.UTC(2026, 10, 2, 11, 30))).toBe("2026-11-02"); // 12:30 Lagos
  });

  it("knows who said goodnight first", () => {
    const now = Date.UTC(2026, 10, 1, 22);
    const rows = [
      { userId: "b", night: "2026-11-01", saidAt: "2026-11-01T21:50:00Z", note: "sleep well" },
      { userId: "a", night: "2026-11-01", saidAt: "2026-11-01T21:55:00Z", note: null },
      { userId: "a", night: "2026-10-31", saidAt: "2026-10-31T21:00:00Z", note: null },
    ];
    expect(goodnightTonight(rows, { me: "a", partner: "b", now })).toMatchObject({ first: "b", both: true });
    expect(goodnightTonight(rows.slice(1), { me: "a", partner: "b", now })).toMatchObject({ first: "a", both: false, theirs: null });
  });

  it("stops the sleep sound when the timer runs out", () => {
    const sleep = { sound: "rain", startedAt: "2026-11-01T22:00:00Z", minutes: 30 };
    expect(sleepSoundNow(sleep, Date.parse("2026-11-01T22:10:00Z"))).toEqual({ on: true, left: 20 * 60_000 });
    expect(sleepSoundNow(sleep, Date.parse("2026-11-01T22:31:00Z")).on).toBe(false);
    expect(sleepSoundNow({ ...sleep, minutes: null }, Date.parse("2026-11-02T04:00:00Z"))).toEqual({ on: true, left: Infinity });
    expect(sleepSoundNow(null).on).toBe(false);
  });
});

describe("shooting stars", () => {
  it("are the same for both of you, come often, and leave a moment to wish", () => {
    let stars = 0;
    for (let w = 1000; w < 1100; w++) {
      const star = starInWindow("couple-1", w);
      expect(starInWindow("couple-1", w)).toEqual(star); // the other screen
      if (!star) continue;
      stars += 1;
      expect(star.at).toBeGreaterThanOrEqual(w * STAR_WINDOW_MS);
      expect(star.at + STAR_MS).toBeLessThan((w + 1) * STAR_WINDOW_MS);
    }
    expect(stars).toBeGreaterThan(40); // most windows have one
    const w = [...Array(50).keys()].map((k) => 2000 + k).find((k) => starInWindow("couple-1", k));
    const star = starInWindow("couple-1", w);
    expect(skyAt("couple-1", star.at + STAR_MS / 2).crossing.progress).toBeCloseTo(0.5);
    expect(skyAt("couple-1", star.at + STAR_MS + WISH_MS / 2).wishable.id).toBe(star.id);
    expect(skyAt("couple-1", star.at + STAR_MS + WISH_MS / 2).crossing).toBeNull();
  });
});
