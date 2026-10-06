import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { palette } from "./tokens";

const css = readFileSync(join(import.meta.dirname, "..", "..", "app", "globals.css"), "utf8");
const cssColors = Object.fromEntries(
  [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, hex]) => [name, hex.toLowerCase()]),
);
const toCssName = (key) => key.replace(/([a-z])(\d)/, "$1-$2").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

describe("design tokens", () => {
  it("lib/design/tokens.js mirrors every palette color in globals.css", () => {
    const fromJs = Object.fromEntries(Object.entries(palette).map(([key, hex]) => [toCssName(key), hex.toLowerCase()]));
    expect(fromJs).toEqual(cssColors);
  });

  it("contains only the official identity families", () => {
    const families = new Set(Object.keys(cssColors).map((name) => name.split("-")[0]));
    expect([...families].sort()).toEqual(["black", "blue", "green", "pink", "red", "text", "white"]);
  });
});
