import "server-only";
import { isMetaPersonConfigured } from "@/lib/character/metaperson.server";
import { loadCharacters } from "@/lib/character/server";
import { supabaseConfigProblem } from "@/lib/config/env";
import { loadCoupleState } from "@/lib/couple/server";
import { reportError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "./session";

/**
 * Resolves everything the first screen depends on, on the server, before any
 * HTML is sent — so the client never flashes the wrong screen.
 *
 * Returns one of:
 *   { status: "unconfigured" }                        Supabase env vars are missing
 *   { status: "unavailable" }                         Supabase unreachable / query failed
 *   { status: "signed_out" }
 *   { status: "signed_in", user: { id, email }, couple, characters, characterProviders }
 *     couple: see lib/couple/server.js; characters: { mine, partner } (lib/character/server.js)
 *     characterProviders: { photo } — whether photo-based creation is configured
 */
export async function resolveViewer() {
  const configProblem = supabaseConfigProblem();
  if (configProblem) {
    console.warn(`[our-place] Sign-in disabled: ${configProblem}.`);
    return { status: "unconfigured" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const session = await getSessionUser(supabase);
    if (session.state === "unavailable") return { status: "unavailable" };
    if (session.state === "signed_out") return { status: "signed_out" };

    const { user } = session;
    const couple = await loadCoupleState(supabase, user.id);
    const partnerId = couple.status === "paired" ? couple.partner.id : null;
    const characters = await loadCharacters(supabase, { userId: user.id, partnerId });
    return {
      status: "signed_in",
      user: { id: user.id, email: user.email ?? null },
      couple,
      characters,
      characterProviders: { photo: isMetaPersonConfigured() },
    };
  } catch (error) {
    reportError(error, { operation: "resolve viewer" });
    return { status: "unavailable" };
  }
}
