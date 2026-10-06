// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Customise } from "./Customise";

vi.mock("@/lib/couple/photos", () => ({
  setCouplePhoto: vi.fn(async () => ({ ok: true })),
  removeCouplePhoto: vi.fn(async () => ({ ok: true })),
}));
const { setCouplePhoto, removeCouplePhoto } = await import("@/lib/couple/photos");

const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const PHOTOS = { togetherA: "https://s.test/a.webp", togetherB: null, partners: [{ userId: ME, slot: 1, url: "https://s.test/me.webp" }, { userId: PARTNER, slot: 2, url: null }] };
const panel = (mySeat = 0, onClose = vi.fn()) => render(<Customise photos={PHOTOS} mySeat={mySeat} me={ME} partner={PARTNER} partnerName="King" onClose={onClose} />);
const pick = (spot) => {
  const file = new File(["x"], "us.jpg", { type: "image/jpeg" });
  fireEvent.change(document.querySelector(`[data-spot='${spot}'] input[type=file]`), { target: { files: [file] } });
  return file;
};

describe("Customise board", () => {
  it("shows the four spots where they sit on the board", () => {
    panel();
    expect(screen.getByRole("button", { name: "Choose a together photo (top left)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose King's photo (top right)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose your photo (bottom left)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose a together photo (bottom right)" })).toBeTruthy();
    expect(document.querySelector("[data-spot='tl'] img").getAttribute("src")).toBe(PHOTOS.togetherA);
    expect(document.querySelector("[data-spot='bl'] img").getAttribute("src")).toBe("https://s.test/me.webp");
  });

  it("picking a picture saves it to that spot: together slots, your portrait, or your partner's", async () => {
    panel();
    await act(async () => pick("tl"));
    expect(setCouplePhoto).toHaveBeenLastCalledWith("together_a", expect.any(File), undefined);
    await act(async () => pick("br"));
    expect(setCouplePhoto).toHaveBeenLastCalledWith("together_b", expect.any(File), undefined);
    await act(async () => pick("tr"));
    expect(setCouplePhoto).toHaveBeenLastCalledWith("portrait", expect.any(File), "partner");
    await act(async () => pick("bl"));
    expect(setCouplePhoto).toHaveBeenLastCalledWith("portrait", expect.any(File), "mine");
    expect(screen.getByRole("status").textContent).toBe("Saved ❤️");
  });

  it("seat B sees the board turned: its top-left is the other together photo", async () => {
    panel(1);
    await act(async () => pick("tl"));
    expect(setCouplePhoto).toHaveBeenLastCalledWith("together_b", expect.any(File), undefined);
  });

  it("Remove clears a spot; Done closes the panel", async () => {
    const onClose = vi.fn();
    panel(0, onClose);
    await act(async () => fireEvent.click(within(document.querySelector("[data-spot='tl']")).getByRole("button", { name: "Remove" })));
    expect(removeCouplePhoto).toHaveBeenCalledWith("together_a", undefined);
    fireEvent.click(screen.getByRole("button", { name: "Done customising" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("a failed save says why, calmly", async () => {
    setCouplePhoto.mockResolvedValueOnce({ ok: false, message: "That photo couldn't be used. Try a JPG, PNG or WebP under 1.5 MB." });
    panel();
    await act(async () => pick("tl"));
    expect(screen.getByRole("status").textContent).toMatch(/couldn't be used/);
  });
});
