import { redirect } from "next/navigation";
import { AppProviders } from "@/components/app/AppProviders";
import { AppStage } from "@/components/app/AppStage";
import { resolveViewer } from "@/lib/auth/viewer";

// Depends on the session cookie: always rendered per request, never cached.
export const dynamic = "force-dynamic";

/**
 * The entry gate. Who you are and whether you're paired are resolved on the
 * server before the first byte of HTML, so the right screen arrives immediately —
 * no login flash, no pairing flash. Paired couples go straight to their world.
 *
 *   signed out → welcome   unpaired → pairing   paired → /character (first time) or /lobby
 */
export default async function Home({ searchParams }) {
  const [viewer, params] = await Promise.all([resolveViewer(), searchParams]);
  if (viewer.status === "signed_in" && viewer.couple.status === "paired") {
    redirect(viewer.characters?.mine ? "/lobby" : "/character");
  }
  const authError = typeof params.auth_error === "string" ? params.auth_error : undefined;

  return (
    <AppProviders viewer={viewer}>
      <AppStage authError={authError} />
    </AppProviders>
  );
}
