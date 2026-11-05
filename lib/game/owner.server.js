import "server-only";
import { createHash } from "node:crypto";

/**
 * The account that runs games which have a host (Naija Whot's house rules and
 * deal). Stored as a hash, so the address itself isn't in the code.
 */
const OWNER_EMAIL_HASH = "c309f05a1e4870d8a8c902ab5503829b4de380905f4348064b0692cfa773d608";

export const hashEmail = (email) => createHash("sha256").update(String(email ?? "").trim().toLowerCase()).digest("hex");

/**
 * Which of these players is the owner? `emailOf(id)` looks up an account's
 * email. Returns null when neither is, or when the lookup fails: a game must
 * still be able to start.
 */
export async function findOwner(playerIds, emailOf, ownerHash = OWNER_EMAIL_HASH) {
  try {
    for (const id of playerIds) {
      if (hashEmail(await emailOf(id)) === ownerHash) return id;
    }
  } catch {
    // Fall through: no host, so either player can run the game.
  }
  return null;
}
