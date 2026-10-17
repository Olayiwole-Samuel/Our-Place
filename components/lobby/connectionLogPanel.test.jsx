// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logConnection } from "@/lib/diagnostics/connectionLog";
import { ConnectionLog } from "./AccountMenu";

afterEach(() => vi.unstubAllGlobals());

describe("Connection log (account menu)", () => {
  it("copies the log; when the clipboard is blocked, shows it as selectable text instead", async () => {
    logConnection("presence", "subscribed");
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const { unmount } = render(<ConnectionLog />);
    fireEvent.click(screen.getByRole("button", { name: /Connection log/ }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy log" })));
    expect(writeText.mock.calls[0][0]).toContain("presence");
    expect(screen.getByRole("button", { name: "Copied — paste it to us" })).toBeTruthy();
    unmount();

    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("NotAllowedError"))) } });
    render(<ConnectionLog />);
    fireEvent.click(screen.getByRole("button", { name: /Connection log/ }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy log" })));
    expect(screen.getByRole("textbox", { name: "Connection log text" }).value).toContain("presence");
  });
});
