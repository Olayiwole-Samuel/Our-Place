/**
 * The short name shown for a person around Our Place. A nickname you chose for
 * your partner is used whole ("My King"); an account name is shortened to its
 * first word ("King Partner" → "King").
 */
export function shortName(profile, fallback = "Your person") {
  if (profile?.nickname) return profile.nickname;
  return profile?.displayName?.trim()?.split(/\s+/)[0] || fallback;
}
