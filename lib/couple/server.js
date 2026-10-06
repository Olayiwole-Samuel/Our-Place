import "server-only";
import { reportError } from "@/lib/errors";
import { isValidInviteCode, sanitizeInviteCode } from "./code";
import { PAIRING_ERROR, PairingError, pairingErrorFromDatabase } from "./errors";

/**
 * Couple data access. Every function takes a Supabase client acting as the
 * signed-in user, so Row Level Security bounds every read; writes go only through
 * the database pairing functions, which derive identity from the JWT.
 *
 * Client-facing couple state:
 *   { status: "unpaired", me, invite: { code, expiresAt } | null }
 *   { status: "paired",   me, partner, couple: { id, pairedAt, mySlot } }
 */

const PROFILE_COLUMNS = "id, display_name, avatar_url, avatar_thumbnail";

function toProfile(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    avatarThumbnail: row.avatar_thumbnail,
  };
}

function check(result, operation) {
  if (result.error) {
    const code = pairingErrorFromDatabase(result.error);
    if (code === PAIRING_ERROR.UNKNOWN || code === PAIRING_ERROR.UNAVAILABLE) {
      reportError(result.error, { operation });
    }
    throw new PairingError(code, { cause: result.error });
  }
  return result.data;
}

export async function loadCoupleState(supabase, userId) {
  const [meResult, membershipResult] = await Promise.all([
    supabase.from("users").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle(),
    supabase.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle(),
  ]);
  const me = check(meResult, "load profile");
  const membership = check(membershipResult, "load membership");
  // The profile is created by a database trigger at sign-up.
  if (!me) throw new PairingError(PAIRING_ERROR.PROFILE_MISSING);

  if (!membership) {
    // RLS limits couple_invites to the caller's own invites.
    const invite = check(
      await supabase
        .from("couple_invites")
        .select("code, expires_at")
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
      "load invite",
    );
    return {
      status: "unpaired",
      me: toProfile(me),
      invite: invite ? { code: invite.code, expiresAt: invite.expires_at } : null,
    };
  }

  const couple = check(
    await supabase.from("couples").select("id, paired_at, user1_id, user2_id").eq("id", membership.couple_id).single(),
    "load couple",
  );
  const partnerId = couple.user1_id === userId ? couple.user2_id : couple.user1_id;
  const partner = check(
    await supabase.from("users").select(PROFILE_COLUMNS).eq("id", partnerId).single(),
    "load partner",
  );

  return {
    status: "paired",
    me: toProfile(me),
    partner: toProfile(partner),
    // slot 1 = inviter, 2 = joiner: decides spawn point and couch seat in the world.
    couple: { id: couple.id, pairedAt: couple.paired_at, mySlot: couple.user1_id === userId ? 1 : 2 },
  };
}

export async function createInvite(supabase) {
  const rows = check(await supabase.rpc("create_couple_invite"), "create invite");
  const invite = rows?.[0];
  if (!invite) throw new PairingError(PAIRING_ERROR.UNKNOWN);
  return { code: invite.code, expiresAt: invite.expires_at };
}

export async function joinCouple(supabase, rawCode) {
  const { code } = sanitizeInviteCode(rawCode);
  // Malformed codes are rejected before touching the database.
  if (!isValidInviteCode(code)) throw new PairingError(PAIRING_ERROR.INVALID_CODE);

  const rows = check(await supabase.rpc("join_couple", { invite_code: code }), "join couple");
  const result = rows?.[0];
  if (!result) throw new PairingError(PAIRING_ERROR.UNKNOWN);
  if (result.error) throw new PairingError(result.error);
}
