import { redirect } from "next/navigation";
import { AppProviders } from "@/components/app/AppProviders";
import { AppStage } from "@/components/app/AppStage";
import { Lobby } from "@/components/lobby/Lobby";
import { resolveViewer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

/**
 * /lobby — the couple's living room. The only world route.
 *
 * Guarded on the server from real, verified state before anything renders:
 *   signed out / unconfigured  → "/" (sign in)
 *   signed in, unpaired        → "/" (pairing)
 *   Supabase unreachable       → connection error with retry (not a redirect loop)
 *   paired, no character yet   → /character (create yourself first)
 *   signed in + paired         → the world
 */
export default async function LobbyPage() {
  const viewer = await resolveViewer();

  if (viewer.status === "unavailable") {
    return (
      <AppProviders viewer={viewer}>
        <AppStage />
      </AppProviders>
    );
  }
  if (viewer.status !== "signed_in" || viewer.couple.status !== "paired") redirect("/");
  if (!viewer.characters?.mine) redirect("/character");

  return (
    <AppProviders viewer={viewer}>
      <Lobby />
    </AppProviders>
  );
}
