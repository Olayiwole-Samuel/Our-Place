import { redirect } from "next/navigation";
import { AppProviders } from "@/components/app/AppProviders";
import { AppStage } from "@/components/app/AppStage";
import { CharacterStudioScreen } from "@/components/studio/CharacterStudioScreen";
import { resolveViewer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your character" };

/**
 * /character — Character Studio. Create yourself (first time) or edit later.
 * Same server-side guard as the world: signed in AND paired.
 */
export default async function CharacterPage() {
  const viewer = await resolveViewer();
  if (viewer.status === "unavailable") {
    return (
      <AppProviders viewer={viewer}>
        <AppStage />
      </AppProviders>
    );
  }
  if (viewer.status !== "signed_in" || viewer.couple.status !== "paired") redirect("/");

  return (
    <AppProviders viewer={viewer}>
      <CharacterStudioScreen photoAvailable={viewer.characterProviders?.photo === true} />
    </AppProviders>
  );
}
