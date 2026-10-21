// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoupleStoreContext, createCoupleStore } from "@/store/coupleStore";
import { NicknameSetting } from "./NicknameSetting";

const ME = { id: "me", displayName: "Arnold Me" };
const PARTNER = { id: "her", displayName: "King Partner", nickname: null, accountName: "King Partner" };
const paired = (partner) => ({ status: "paired", me: ME, partner, couple: { id: "c", pairedAt: "2026-03-06", mySlot: 1 } });

afterEach(() => vi.unstubAllGlobals());

describe("your name for your partner", () => {
  it("saves a nickname; the partner's name everywhere becomes it", async () => {
    const renamed = { ...PARTNER, displayName: "My Queen", nickname: "My Queen" };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(paired(renamed)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const store = createCoupleStore(paired(PARTNER));
    render(
      <CoupleStoreContext.Provider value={store}>
        <NicknameSetting />
      </CoupleStoreContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Name for King/ }));
    fireEvent.change(screen.getByLabelText(/Your name for King/), { target: { value: "My Queen" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save name" })));
    expect(fetchMock).toHaveBeenCalledWith("/api/couple/nickname", expect.objectContaining({ method: "POST", body: JSON.stringify({ nickname: "My Queen" }) }));
    expect(store.getState().partner.displayName).toBe("My Queen");
    expect(screen.getByRole("button", { name: /Calling them “My Queen”/ })).toBeTruthy();
  });

  it("a failed save keeps the form open with calm copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "unknown" } }), { status: 500 })));
    render(
      <CoupleStoreContext.Provider value={createCoupleStore(paired(PARTNER))}>
        <NicknameSetting />
      </CoupleStoreContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Name for King/ }));
    fireEvent.change(screen.getByLabelText(/Your name for King/), { target: { value: "Babe" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save name" })));
    expect(screen.getByRole("alert").textContent).toBe("Couldn't save that name. Try again.");
  });
});
