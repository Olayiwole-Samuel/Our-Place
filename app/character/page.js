import { redirect } from "next/navigation";

/**
 * /character — retired. Characters are now a male or female look chosen in the
 * world itself (account menu), so the old studio link goes straight there.
 */
export default function CharacterPage() {
  redirect("/lobby");
}
