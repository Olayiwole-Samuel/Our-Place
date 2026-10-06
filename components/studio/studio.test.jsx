// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const characterApi = { get: vi.fn(), save: vi.fn(), providerToken: vi.fn(), importProviderModel: vi.fn() };
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("@/lib/character/client", () => ({ characterApi }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The 3D stage needs WebGL; the studio's logic is what's under test here.
vi.mock("./StudioStage", () => ({ default: () => <div data-testid="stage" /> }));

const { CharacterStore } = await import("./testStoreHarness");
const { CharacterStudioScreen } = await import("./CharacterStudioScreen");
const { DEFAULT_CHARACTER } = await import("@/lib/character/schema");
const { useToastStore } = await import("@/store/toastStore");

const saved = { userId: "me", provider: "ourplace", version: 1, config: DEFAULT_CHARACTER, model: null };

function renderStudio({ mine = null, photoAvailable = false } = {}) {
  return render(
    <CharacterStore initial={{ mine }}>
      <CharacterStudioScreen photoAvailable={photoAvailable} />
    </CharacterStore>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
});

describe("first-time creation", () => {
  it("opens with 'Let's create you.' and is honest about photo availability", () => {
    renderStudio({ photoAvailable: false });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Let's create you.");
    const photo = screen.getByRole("button", { name: /start from a photo/i });
    expect(photo).toHaveProperty("disabled", true);
    expect(photo.textContent).toMatch(/Not available yet/);
  });

  it("enables photo creation only when the provider is configured", () => {
    renderStudio({ photoAvailable: true });
    expect(screen.getByRole("button", { name: /start from a photo/i })).toHaveProperty("disabled", false);
  });

  it("designs a look from a starting point and saves it before entering", async () => {
    const user = userEvent.setup();
    characterApi.save.mockImplementation(async (config) => ({ ok: true, data: { character: { ...saved, config } } }));
    renderStudio();
    await user.click(screen.getByRole("button", { name: /design your look/i }));
    await user.click(screen.getByRole("radio", { name: "Bold" }));
    await user.click(screen.getByRole("button", { name: "Save & enter" }));
    expect(characterApi.save).toHaveBeenCalledTimes(1);
    expect(characterApi.save.mock.calls[0][0].hair.style).toBe("locs"); // the Bold look
    expect(useToastStore.getState().toasts[0].message).toMatch(/Welcome to Our Place/);
  });
});

describe("editing a saved character", () => {
  it("is 'Saved' until something changes, then offers Save", async () => {
    const user = userEvent.setup();
    renderStudio({ mine: saved });
    expect(screen.getByRole("button", { name: "Saved" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("tab", { name: "Hair" }));
    await user.click(screen.getByRole("radio", { name: "Afro" }));
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("never reports success before the server confirms; a failed save keeps the draft", async () => {
    const user = userEvent.setup();
    characterApi.save.mockResolvedValue({ ok: false, code: "network" });
    renderStudio({ mine: saved });
    await user.click(screen.getByRole("tab", { name: "Hair" }));
    await user.click(screen.getByRole("radio", { name: "Bun" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ tone: "error", message: "We couldn't connect right now." });
    expect(screen.getByRole("radio", { name: "Bun" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
  });

  it("asks before leaving with unsaved changes: keep editing, discard, or save", async () => {
    const user = userEvent.setup();
    renderStudio({ mine: saved });
    await user.click(screen.getByRole("tab", { name: "Body" }));
    fireEvent.change(screen.getByLabelText("Height"), { target: { value: "0.9" } });
    await user.click(screen.getByRole("button", { name: /our place/i }));
    const dialog = screen.getByRole("alertdialog", { name: "Save changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(router.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /our place/i }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard" }));
    expect(router.push).toHaveBeenCalledWith("/lobby");
    expect(characterApi.save).not.toHaveBeenCalled();
  });

  it("leaves straight away when nothing changed", async () => {
    const user = userEvent.setup();
    renderStudio({ mine: saved });
    await user.click(screen.getByRole("button", { name: /our place/i }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(router.push).toHaveBeenCalledWith("/lobby");
  });
});
