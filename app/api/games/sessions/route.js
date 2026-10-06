import { gameRoute } from "@/lib/game/route.server";

export const dynamic = "force-dynamic";

/** POST /api/games/sessions { gameId } — create a waiting session for the caller's couple. */
export const POST = gameRoute(async ({ service, userId, body }) => ({ session: await service.create(userId, body.gameId) }), { mutation: true });
