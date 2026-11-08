import { describe, expect, it } from "vitest";
import { missedDays } from "./streak";

const noon = new Date("2026-11-08T12:00:00Z");

describe("missedDays", () => {
  it("is 0 when you were together today or yesterday, or never", () => {
    expect(missedDays("2026-11-08", noon, "Africa/Lagos")).toBe(0);
    expect(missedDays("2026-11-07", noon, "Africa/Lagos")).toBe(0);
    expect(missedDays(null, noon, "Africa/Lagos")).toBe(0);
  });

  it("counts the days missed before today", () => {
    expect(missedDays("2026-11-05", noon, "Africa/Lagos")).toBe(2);
    expect(missedDays("2026-10-01", noon, "Africa/Lagos")).toBe(37);
  });

  it("uses your own calendar day", () => {
    const lateNight = new Date("2026-11-08T23:30:00Z"); // already the 9th in Lagos
    expect(missedDays("2026-11-07", lateNight, "Africa/Lagos")).toBe(1);
    expect(missedDays("2026-11-07", lateNight, "America/New_York")).toBe(0);
  });
});
