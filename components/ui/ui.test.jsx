// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/client", () => ({ signInWithGoogle: vi.fn(), signOut: vi.fn() }));

const { WelcomeScreen } = await import("@/components/auth/WelcomeScreen");
const { Button } = await import("./Button");
const { LoadingScreen } = await import("./LoadingScreen");
const { ErrorState } = await import("./ErrorState");
const { AppError, ERROR_CATEGORY } = await import("@/lib/errors");

describe("WelcomeScreen", () => {
  it("offers a single, accessible Google sign-in", () => {
    render(<WelcomeScreen />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("You're almost home.");
    const button = screen.getByRole("button", { name: /continue with google/i });
    expect(button).toHaveProperty("disabled", false);
    expect(screen.queryByRole("textbox")).toBeNull(); // no email/password form
  });

  it("disables sign-in honestly when the server isn't configured", () => {
    render(<WelcomeScreen unconfigured />);
    const button = screen.getByRole("button", { name: /continue with google/i });
    expect(button).toHaveProperty("disabled", true);
    expect(document.getElementById(button.getAttribute("aria-describedby")).textContent).toMatch(/isn't set up/);
  });

  it("explains a failed or cancelled sign-in", () => {
    const { unmount } = render(<WelcomeScreen authError="failed" />);
    expect(screen.getByRole("alert").textContent).toBe("We couldn't sign you in. Try again.");
    unmount();
    render(<WelcomeScreen authError="cancelled" />);
    expect(screen.getByRole("alert").textContent).toMatch(/cancelled/);
  });
});

describe("Button", () => {
  it("announces pending work and blocks repeat presses", () => {
    render(<Button pending pendingLabel="Joining…">Join</Button>);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button).toHaveProperty("disabled", true);
    expect(button.textContent).toBe("Joining…");
  });
});

describe("loading and error states", () => {
  it("loading is announced politely with what is loading", () => {
    render(<LoadingScreen label="Opening your room" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("Opening your room");
  });

  it("errors show category copy and a retry, never raw messages", () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new Error("ECONNRESET at socket 10.0.0.4")} onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toContain("ECONNRESET");
    screen.getByRole("button", { name: "Try again" }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  it("connection errors use the product's copy", () => {
    render(<ErrorState error={new AppError(ERROR_CATEGORY.CONNECTION)} onRetry={() => {}} />);
    expect(screen.getByRole("heading").textContent).toBe("We couldn't connect right now");
  });
});
