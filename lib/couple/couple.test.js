import { describe, expect, it } from "vitest";
import { INVITE_CODE_ALPHABET, isValidInviteCode, sanitizeInviteCode } from "./code";
import { PAIRING_ERROR, isRetryablePairingError, pairingErrorFromDatabase, pairingErrorMessage, pairingErrorStatus } from "./errors";

describe("invite code format", () => {
  it("uses 31 unambiguous symbols", () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(31);
    for (const ambiguous of ["0", "O", "1", "I", "L"]) expect(INVITE_CODE_ALPHABET).not.toContain(ambiguous);
  });

  it("uppercases and strips separators from pasted codes", () => {
    expect(sanitizeInviteCode(" a7k-9q2 ")).toEqual({ code: "A7K9Q2", dropped: false });
  });

  it("drops characters that can never appear and reports it", () => {
    expect(sanitizeInviteCode("A0K")).toEqual({ code: "AK", dropped: true });
  });

  it("caps at six characters", () => {
    expect(sanitizeInviteCode("ABCDEFGHJK").code).toBe("ABCDEF");
  });

  it("validates complete codes only", () => {
    expect(isValidInviteCode("A7K9Q2")).toBe(true);
    expect(isValidInviteCode("A7K9Q")).toBe(false);
    expect(isValidInviteCode("a7k9q2")).toBe(false);
    expect(isValidInviteCode(null)).toBe(false);
  });
});

describe("pairing errors", () => {
  it("uses the product's exact copy", () => {
    expect(pairingErrorMessage("invalid_code")).toBe("That invite code isn't valid.");
    expect(pairingErrorMessage("invite_unavailable")).toBe("This invite is no longer available.");
    expect(pairingErrorMessage("already_paired")).toBe("You're already paired.");
    expect(pairingErrorMessage("self_pair")).toBe("You can't use your own invite.");
    expect(pairingErrorMessage("couple_complete")).toBe("This couple is already complete.");
    expect(pairingErrorMessage("network")).toBe("We couldn't connect right now.");
  });

  it("collapses anything unknown to a generic message", () => {
    expect(pairingErrorMessage('relation "couples" does not exist')).toBe("Something went wrong. Try again.");
    expect(pairingErrorStatus("whatever")).toBe(500);
  });

  it("maps database errors without leaking them", () => {
    expect(pairingErrorFromDatabase({ message: "pairing:already_paired" })).toBe(PAIRING_ERROR.ALREADY_PAIRED);
    expect(pairingErrorFromDatabase({ message: "pairing:made_up" })).toBe(PAIRING_ERROR.UNKNOWN);
    expect(pairingErrorFromDatabase({ message: "TypeError: fetch failed" })).toBe(PAIRING_ERROR.UNAVAILABLE);
    expect(pairingErrorFromDatabase({ message: "permission denied for table couples" })).toBe(PAIRING_ERROR.UNKNOWN);
  });

  it("offers retry only for temporary failures", () => {
    expect(isRetryablePairingError("network")).toBe(true);
    expect(isRetryablePairingError("invalid_code")).toBe(false);
  });
});
