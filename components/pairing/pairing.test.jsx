// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const coupleApi = { getState: vi.fn(), createInvite: vi.fn(), join: vi.fn() };
vi.mock("@/lib/couple/client", () => ({ coupleApi }));

const { CoupleStoreContext, createCoupleStore } = await import("@/store/coupleStore");
const { CodeInput } = await import("./CodeInput");
const { JoinCodePanel } = await import("./JoinCodePanel");
const { InviteCodePanel } = await import("./InviteCodePanel");

const me = { id: "me", displayName: "Me", avatarUrl: null, avatarThumbnail: null };

function withStore(ui, state = { status: "unpaired", me, invite: null }) {
  const store = createCoupleStore(state);
  return { store, ...render(<CoupleStoreContext.Provider value={store}>{ui}</CoupleStoreContext.Provider>) };
}

function ControlledCodeInput({ onSubmit }) {
  const [value, setValue] = useState("");
  return <CodeInput value={value} onChange={setValue} onSubmit={onSubmit} />;
}

beforeEach(() => vi.clearAllMocks());

describe("CodeInput", () => {
  it("is labelled and uppercases as you type", async () => {
    const user = userEvent.setup();
    render(<ControlledCodeInput />);
    const input = screen.getByLabelText(/invite code/i);
    await user.type(input, "a7k9q2");
    expect(input).toHaveProperty("value", "A7K9Q2");
  });

  it("accepts pasted codes with separators and stops at six", async () => {
    const user = userEvent.setup();
    render(<ControlledCodeInput />);
    const input = screen.getByLabelText(/invite code/i);
    await user.click(input);
    await user.paste(" a7k-9q2-XYZ ");
    expect(input).toHaveProperty("value", "A7K9Q2");
  });

  it("drops impossible characters and explains why", async () => {
    const user = userEvent.setup();
    render(<ControlledCodeInput />);
    const input = screen.getByLabelText(/invite code/i);
    await user.type(input, "A0");
    expect(input).toHaveProperty("value", "A");
    expect(screen.getByText(/never use 0, O, 1, I or L/)).toBeTruthy();
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("submits with Enter and supports backspace", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ControlledCodeInput onSubmit={onSubmit} />);
    const input = screen.getByLabelText(/invite code/i);
    await user.type(input, "ABC{Backspace}{Enter}");
    expect(input).toHaveProperty("value", "AB");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("JoinCodePanel", () => {
  it("shows neutral guidance (not error styling) before any attempt", () => {
    withStore(<JoinCodePanel />);
    const hint = screen.getByText(/letters and numbers/);
    expect(hint.className).toContain("text-text-muted");
    expect(hint.className).not.toContain("text-red");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps Join disabled until the code is complete", async () => {
    const user = userEvent.setup();
    withStore(<JoinCodePanel />);
    const button = screen.getByRole("button", { name: "Join" });
    expect(button).toHaveProperty("disabled", true);
    await user.type(screen.getByLabelText(/invite code/i), "A7K9Q2");
    expect(button).toHaveProperty("disabled", false);
  });

  it("shows the invalid-code message and keeps the input", async () => {
    const user = userEvent.setup();
    coupleApi.join.mockResolvedValue({ ok: false, code: "invalid_code" });
    withStore(<JoinCodePanel />);
    const input = screen.getByLabelText(/invite code/i);
    await user.type(input, "ZZZZZZ{Enter}");
    expect((await screen.findByRole("alert")).textContent).toBe("That invite code isn't valid.");
    expect(input).toHaveProperty("value", "ZZZZZZ");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("on a network failure keeps the code and offers Try again", async () => {
    const user = userEvent.setup();
    coupleApi.join.mockResolvedValueOnce({ ok: false, code: "network" });
    withStore(<JoinCodePanel />);
    const input = screen.getByLabelText(/invite code/i);
    await user.type(input, "A7K9Q2");
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't connect right now.");
    expect(input).toHaveProperty("value", "A7K9Q2");

    coupleApi.join.mockResolvedValueOnce({
      ok: true,
      data: { status: "paired", me, partner: { ...me, id: "p" }, couple: { id: "c", pairedAt: "x" } },
    });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(coupleApi.join).toHaveBeenLastCalledWith("A7K9Q2");
  });

  it("flips the couple to paired on success", async () => {
    const user = userEvent.setup();
    const partner = { ...me, id: "p", displayName: "Sam" };
    coupleApi.join.mockResolvedValue({ ok: true, data: { status: "paired", me, partner, couple: { id: "c", pairedAt: "x" } } });
    const { store } = withStore(<JoinCodePanel />);
    await user.type(screen.getByLabelText(/invite code/i), "A7K9Q2{Enter}");
    await vi.waitFor(() => expect(store.getState()).toMatchObject({ status: "paired", justPaired: true }));
  });
});

describe("InviteCodePanel", () => {
  it("creates an invite on open, spells it out for screen readers, and copies it", async () => {
    const user = userEvent.setup();
    coupleApi.createInvite.mockResolvedValue({ ok: true, data: { invite: { code: "A7K9Q2", expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() } } });
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    withStore(<InviteCodePanel />);

    expect(await screen.findByText("Your invite code is A 7 K 9 Q 2")).toBeTruthy();
    expect(screen.getByText(/Waiting for your person/)).toBeTruthy();
    expect(screen.getByText(/Expires in 7 days/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /copy code/i }));
    expect(writeText).toHaveBeenCalledWith("A7K9Q2");
  });

  it("reuses an existing invite instead of creating another", async () => {
    withStore(<InviteCodePanel />, { status: "unpaired", me, invite: { code: "BCDFGH", expiresAt: new Date(Date.now() + 864e5).toISOString() } });
    expect(screen.getByText("Your invite code is B C D F G H")).toBeTruthy();
    await act(async () => {});
    expect(coupleApi.createInvite).not.toHaveBeenCalled();
  });

  it("shows a retry when the invite can't be created", async () => {
    coupleApi.createInvite.mockResolvedValue({ ok: false, code: "network" });
    withStore(<InviteCodePanel />);
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't connect right now.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
