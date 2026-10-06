import { gameRoute } from "@/lib/game/route.server";

export const dynamic = "force-dynamic";

/** GET /api/games/sessions/current — the couple's open (or just-finished) session + my view. */
export const GET = gameRoute(async ({ service, userId }) => service.current(userId));
