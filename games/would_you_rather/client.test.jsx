// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WouldYouRather from "./client";

const ME = "me";
const PARTNER = "partner";
const question = { id: "wyr-001", optionA: "Travel the world together", optionB: "Build our dream home" };
const base = { round: 2, rounds: 10, phase: "answering", question, myAnswer: null, partnerAnswered: false, partnerAnswer: null, myNext: false, partnerNext: false, roundsPlayed: 1 };
const renderGame = (view, act = vi.fn()) => {
  render(<WouldYouRather view={{ ...base, ...view }} me={ME} partner={PARTNER} names={{ [ME]: "You", [PARTNER]: "King" }} status="active" busy={false} act={act} />);
  return act;
};

describe("Would You Rather screen", () => {
  it("shows the question and both options as labelled buttons", () => {
    renderGame({});
    expect(screen.getByText("Would you rather…")).toBeTruthy();
    expect(screen.getByText("Round 2 of 10")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Option A: Travel the world together" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Option B: Build our dream home" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Choose one");
  });

  it("answering sends only the choice (an intent)", () => {
    const act = renderGame({});
    fireEvent.click(screen.getByRole("button", { name: /Option B/ }));
    expect(act).toHaveBeenCalledWith("answer", { choice: "B" });
  });

  it("after answering: locked, selected, waiting for the partner", () => {
    const act = renderGame({ myAnswer: "A" });
    const a = screen.getByRole("button", { name: /Option A/ });
    expect(a.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Option B/ }));
    expect(act).not.toHaveBeenCalledWith("answer", expect.anything());
    expect(screen.getByRole("status").textContent).toBe("Waiting for King…");
  });

  it("the partner having answered is shown — never what they chose", () => {
    renderGame({ partnerAnswered: true });
    expect(screen.getByRole("status").textContent).toBe("❤️ King has answered");
    expect(screen.queryByText("King", { selector: "span.rounded-full" })).toBeNull();
  });

  it("reveal shows both answers together and offers Next", () => {
    const act = renderGame({ phase: "revealing", myAnswer: "A", partnerAnswered: true, partnerAnswer: "B" });
    expect(screen.getByRole("status").textContent).toBe("You chose differently 👀");
    expect(screen.getByLabelText("Chosen by you")).toBeTruthy();
    expect(screen.getByLabelText("Chosen by King")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(act).toHaveBeenCalledWith("next", {});
  });

  it("same answers are celebrated; after Next it waits for the partner together", () => {
    renderGame({ phase: "revealing", myAnswer: "B", partnerAnswered: true, partnerAnswer: "B", myNext: true });
    expect(screen.getByRole("status").textContent).toBe("Same answer ❤️");
    expect(screen.getByLabelText("Chosen by you and King")).toBeTruthy();
    expect(screen.getByText("Waiting for King…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next question" })).toBeNull();
  });

  it("last round says 'See how it went'; Finish game ends early", () => {
    const act = renderGame({ phase: "revealing", round: 10, myAnswer: "A", partnerAnswered: true, partnerAnswer: "A" });
    expect(screen.getByRole("button", { name: "See how it went" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish game" }));
    expect(act).toHaveBeenCalledWith("finish", {});
  });

  it("renders question text as text, never HTML", () => {
    renderGame({ question: { ...question, optionA: "<b>bold</b>" } });
    expect(screen.getByRole("button", { name: /Option A/ }).querySelector("b")).toBeNull();
  });
});
