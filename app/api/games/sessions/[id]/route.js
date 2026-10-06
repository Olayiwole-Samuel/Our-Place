import { gameRoute } from "@/lib/game/route.server";

export const dynamic = "force-dynamic";

/** GET /api/games/sessions/:id — summary + my view (authoritative; used after every live event and on reconnect). */
export const GET = gameRoute(async ({ service, userId, params }) => service.view(userId, params.id));
