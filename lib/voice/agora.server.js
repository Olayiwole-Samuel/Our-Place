import "server-only";
import { createHmac } from "node:crypto";
import agoraToken from "agora-token";

const { RtcRole, RtcTokenBuilder } = agoraToken;

/**
 * Agora (voice) — server side only. The App Certificate never leaves the server.
 *
 * Agora runs a global voice network built for games: both phones connect to
 * Agora's nearest edge, which handles mobile data, strict NATs and network
 * changes. Free tier: 10,000 participant-minutes every month (a couple talking
 * uses 2 per minute, so ≈ 83 hours together a month), no card needed.
 *
 *   AGORA_APP_ID           the project's App ID (Agora Console → Projects)
 *   AGORA_APP_CERTIFICATE  the project's primary certificate (secured mode)
 *
 * Channel model: one channel per couple, named by an HMAC of the couple id keyed
 * by the certificate, so it reveals nothing and can't be guessed or chosen by a
 * client. Tokens are bound to that channel and to the caller's own user id (the
 * client uses it to tell the partner apart; only the server can sign one).
 * Nothing is recorded: Our Place never enables Agora recording.
 */
const TOKEN_TTL_S = 4 * 60 * 60; // the client renews before expiry; a live call is never cut off

const clean = (value) => String(value ?? "").trim().replace(/^["']|["']$/g, "").trim();

export function agoraConfig(env = process.env) {
  const appId = clean(env.AGORA_APP_ID);
  const certificate = clean(env.AGORA_APP_CERTIFICATE);
  return /^[0-9a-f]{32}$/i.test(appId) && /^[0-9a-f]{32}$/i.test(certificate) ? { appId, certificate } : null;
}

export const isAgoraConfigured = (env = process.env) => agoraConfig(env) !== null;

export function coupleChannelName(coupleId, certificate) {
  const digest = createHmac("sha256", certificate).update(`our-place:voice:${coupleId}`).digest("hex");
  return `op-${digest.slice(0, 32)}`;
}

/** { appId, channel, uid, token, expiresAt } for this user in their couple's channel. */
export function createAgoraAccess({ coupleId, userId, env = process.env, now = Date.now }) {
  const config = agoraConfig(env);
  if (!config) throw new Error("Agora is not configured");
  const channel = coupleChannelName(coupleId, config.certificate);
  const token = RtcTokenBuilder.buildTokenWithUserAccount(config.appId, config.certificate, channel, userId, RtcRole.PUBLISHER, TOKEN_TTL_S, TOKEN_TTL_S);
  return { appId: config.appId, channel, uid: userId, token, expiresAt: now() + TOKEN_TTL_S * 1000 };
}
