import { GameSessionError } from "@/lib/game/sessionErrors";
import { gameRoute } from "@/lib/game/route.server";

export const dynamic = "force-dynamic";

/**
 * POST /api/games/sessions/:id/join            {}
 * POST /api/games/sessions/:id/ready           { ready: boolean }
 * POST /api/games/sessions/:id/action          { type, payload, version? }
 * POST /api/games/sessions/:id/leave           {}
 */
const OPS = {
  join: async ({ service, userId, params }) => ({ session: await service.join(userId, params.id) }),
  ready: async ({ service, userId, params, body }) => ({ session: await service.ready(userId, params.id, body.ready) }),
  action: async ({ service, userId, params, body }) => service.action(userId, params.id, body),
  leave: async ({ service, userId, params }) => ({ session: await service.leave(userId, params.id) }),
};

export const POST = gameRoute(
  async (context) => {
    const op = OPS[context.params.op];
    if (!op) throw new GameSessionError("invalid_request");
    return op(context);
  },
  { mutation: true },
);
