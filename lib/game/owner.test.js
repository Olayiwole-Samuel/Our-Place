import { describe, expect, it } from "vitest";
import { findOwner, hashEmail } from "./owner.server";

const emails = { a: "someone@example.com", b: " Owner@Example.com " };
const emailOf = async (id) => emails[id];
const ownerHash = hashEmail("owner@example.com");

describe("findOwner", () => {
  it("finds the player whose account is the owner's, ignoring case and spaces", async () => {
    await expect(findOwner(["a", "b"], emailOf, ownerHash)).resolves.toBe("b");
  });

  it("returns null when neither player is the owner", async () => {
    await expect(findOwner(["a"], emailOf, ownerHash)).resolves.toBeNull();
  });

  it("returns null when the lookup fails, so a game can still start", async () => {
    const broken = async () => {
      throw new Error("no database");
    };
    await expect(findOwner(["a", "b"], broken, ownerHash)).resolves.toBeNull();
  });
});
