import { notFound } from "next/navigation";
import { LudoSandbox } from "@/components/dev/LudoSandbox";

export const dynamic = "force-dynamic";

/** DEVELOPMENT ONLY — the real Ludo board on the real rules, both seats played locally. 404 in production. */
export default function LudoSandboxPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LudoSandbox />;
}
