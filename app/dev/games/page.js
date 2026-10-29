import { notFound } from "next/navigation";
import { GamesSandbox } from "@/components/dev/GamesSandbox";

export const dynamic = "force-dynamic";

/** DEVELOPMENT ONLY — any game on its real rules, both seats played locally (?game=connect_4). 404 in production. */
export default function GamesSandboxPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GamesSandbox />;
}
