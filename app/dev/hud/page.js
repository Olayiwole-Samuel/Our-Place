import { notFound } from "next/navigation";
import { HudPreviewClient } from "@/components/dev/HudPreviewClient";

export const dynamic = "force-dynamic";

/**
 * DEVELOPMENT ONLY — not part of the product.
 * /dev/hud renders the real living room and HUD with stand-in couple data (no
 * sign-in), so layouts can be checked at any phone size. Query options:
 *   ?game=ludo|ttt|wyr|chess   open a sample game in the shell (chess and later games
 *                       run their real rules with scripted moves)
 *   &phase=lobby|result  that game's ready screen or result instead of play
 *   ?chat=1              open the chat panel with sample messages and replies (&typing=1: the partner is typing)
 *   ?panel=us|notes|memories|tv|tv-playing|shelf   a room panel with sample data (?room=1: sample data only)
 *   &since=YYYY-MM-DD   the day you got together (default 2026-03-06; a monthsary today shows the celebration)
 *   ?drawer=<category>   open the game menu (menu = the category list)
 *   ?me=female&partner=male   characters' looks (default: male)
 *   ?screen=pairing|character   the pairing screen or Character Studio instead
 * 404 in production.
 */
export default function HudPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HudPreviewClient />;
}
