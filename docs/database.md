# Database and Supabase

## Clients — one per context, all centralized

| Client | File | Runs as | Use for |
| --- | --- | --- | --- |
| Browser | `lib/supabase/client.js` → `getSupabaseBrowserClient()` | Signed-in user, RLS applies | Realtime subscriptions, RLS-safe reads/writes from client components |
| Server | `lib/supabase/server.js` → `createSupabaseServerClient()` | Signed-in user (cookies), RLS applies | Server Components, Server Actions, Route Handlers |
| Admin | `lib/supabase/admin.js` → `createSupabaseAdminClient()` | Service role, **bypasses RLS** | Server-only operations that cannot run as the user (e.g. persisting validated game results). Caller must authorize first. **Unused so far** — pairing runs as the user through `security definer` functions. |
| Middleware | `lib/supabase/middleware.js` → `updateSession()` | — | Refreshes the auth cookie on each request. Authorization is enforced in `lib/auth/viewer.js` / `lib/api/route.js`, never by middleware alone. |

Never call `createClient`/`createBrowserClient` anywhere else. Server and admin modules import `server-only`, so importing them from client code fails the build.

On the server, identity always comes from `await supabase.auth.getUser()` (validated with Supabase Auth). `getSession()` reads the cookie without verification and must not be used for authorization.

## Migrations

- Location: `supabase/migrations/`
- Name: `YYYYMMDDHHMMSS_snake_case_description.sql` (UTC timestamp; Supabase CLI applies in order)
- Never edit a migration that has been applied to a shared environment — add a new one.
- Workflow (once a Supabase project exists): `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`. The CLI is not a project dependency; run it with `npx`.

| Migration | Contents |
| --- | --- |
| `20261004000000_foundation.sql` | `private` schema (not exposed via the Data API), `private.set_updated_at()` |
| `20261005000000_realtime_couple_channels.sql` | RLS on `realtime.messages`: only a couple's two members may join/send on `our-place:couple:<their couple>:*` (presence, broadcast) |
| `20261004100000_users_couples_pairing.sql` | `users`, `couples`, `couple_members`, `couple_invites`, `private.pairing_attempts`; profile trigger on `auth.users`; pairing functions; RLS helpers and policies; least-privilege grants |

Tests run these exact files in real Postgres: `npm test` (see `supabase/tests/`).

## Conventions

| Topic | Convention |
| --- | --- |
| Primary keys | `id uuid primary key default gen_random_uuid()` |
| Users | `users.id` references `auth.users(id) on delete cascade` |
| Timestamps | `timestamptz not null default now()`; `created_at` everywhere, `updated_at` + `private.set_updated_at()` trigger on mutable tables |
| Foreign keys | `<entity>_id`, explicit `on delete` (cascade for couple-owned data), **always indexed** |
| Couple-owned rows | Carry `couple_id` directly (even when derivable) so RLS is a single indexed check |
| Naming | `snake_case`, plural table names |
| Enums | `text` + `check` constraint (easier to evolve than Postgres enums) |
| Game state | `jsonb`, shape owned and validated by the game's rules module |
| Helpers | `private` schema; `security definer` functions set `search_path = ''` |

## Row Level Security strategy

**Rule: a user may only access data belonging to their own couple.**

1. RLS is enabled on every `public` table in the migration that creates it. No table ships without policies.
2. Membership comes from three `security definer` helpers (they read `couple_members` without recursive RLS):
   - `private.current_couple_id()` — the caller's couple (via the `couple_members` primary key)
   - `private.is_couple_member(couple_id)` — `couple_id = current_couple_id()`
   - `private.current_partner_id()` — the other member

3. Couple-owned tables use it: `using (private.is_couple_member(couple_id))`, with the matching `with check` on insert/update.
4. Server-decided data (`game_sessions` results, `win_streaks`, `app_streaks`, `leaderboard`) is **read-only** to users: `select` policy only; writes happen through the admin client from the game server or a server action after validation.
5. `(select auth.uid())` is wrapped in a subquery so Postgres evaluates it once per statement.
6. Storage buckets are private; object paths start with `couple_id/` and storage policies apply the same membership check.
7. **Realtime is authorized by RLS** (done): couple channels are private, `our-place:couple:<coupleId>:<channel>`, and policies on `realtime.messages` admit only the couple's two members (`private.can_access_couple_topic`). Unpaired, anonymous and other-couple clients are refused — tested in `supabase/tests/realtime.test.js`. Project setting required: Realtime → disable **Allow public access**.

## Tables that exist (Phase 2)

| Table | Key columns | Constraints & indexes | RLS (authenticated) | Writes |
| --- | --- | --- | --- | --- |
| `users` | `id` → `auth.users`, `email`, `display_name`, `avatar_url`, `avatar_thumbnail`, `created_at`, `updated_at` | `display_name` ≤ 80; `avatar_url` https-only; `updated_at` trigger | Read self + partner; `email` column **not granted** | Trigger from `auth.users` only |
| `couples` | `id`, `user1_id`, `user2_id`, `invite_code`, `paired_at` | `user1 ≠ user2`; `unique(user1_id)`, `unique(user2_id)`, `unique(invite_code)`; FKs `on delete restrict`; deferred consistency trigger | Members read their couple | `join_couple()` only |
| `couple_members` | `user_id` (PK), `couple_id`, `slot` | PK = one couple per user; `slot in (1,2)` + `unique(couple_id, slot)` = max two; index on `couple_id` | Members read their couple's rows | `join_couple()` only |
| `couple_invites` | `id`, `code`, `created_by`, `status`, `expires_at`, `used_by`, `used_at`, `couple_id` | Code format check + `unique(code)` forever; one `active` invite per user (partial unique); status check; not-self check; FK indexes | Creator reads own (limited columns) | `create_couple_invite()` / `join_couple()` only |
| `private.pairing_attempts` | `user_id`, `reason`, `attempted_at` | Index `(user_id, attempted_at desc)` | No access | `join_couple()` only |

Functions callable by `authenticated`: `create_couple_invite()` and `join_couple(invite_code)`. Neither accepts a user id or couple id. See [auth-and-pairing.md](auth-and-pairing.md).

## Chat and emotes (Phase 4 — `20261007000000_chat_and_emotes.sql`)

| Object | What | Access |
| --- | --- | --- |
| `messages` | `id`, `couple_id`, `sender_id` (null only for `system`), `type` (`text`/`emote`/`system`), `content` (1–2000 chars), `client_id`, `created_at`; index `(couple_id, created_at desc, id desc)`; `unique(sender_id, client_id)` | Members **read** their couple's rows. No insert/update/delete grants. |
| `send_message(content, client_id)` | Only write path. Sender = `auth.uid()`, couple from membership; strips control chars, trims, rejects empty/oversized; 8 per 10 s per sender; idempotent per `client_id`. Raises `chat:<reason>`. | `authenticated` |
| trigger `broadcast_message` | After insert, `realtime.send` of the row on `our-place:couple:<id>:chat` (private) | Database only |
| `send_emote(emote)` | Validates one of the 7 emotes, 1 s per-user limit (`private.emote_rate`), broadcasts `{ sender_id: auth.uid(), emote, at }` on `…:emotes`. Nothing stored. | `authenticated` |
| Realtime send policy | Clients may broadcast/track only on `…:presence` and `…:lobby`. `…:chat`, `…:emotes` and `…:notifications` are written by the database only, so chat messages and emotes can't be forged. | — |

`20261021000000_chat_replies.sql` adds replies: `messages.reply_to` (nullable) points at the message being answered. The foreign key is `(couple_id, reply_to) → messages (couple_id, id) on delete set null (reply_to)`, so a reply can only point at the same couple's message, and it stays if the original is deleted. `send_message(content, client_id, reply_to)` takes it as an optional third argument (two-argument calls work as before) and raises `chat:invalid_reply` for anything else. The broadcast payload includes `reply_to`. Before this migration is applied, the app sees that the column is missing and hides replies.

Typing indicators ("… is typing") use `typing` broadcasts on the client-writable `…:presence` topic. They are live only and nothing is stored.

`20261008000000_voice_signaling.sql` adds `…:voice` to the client-writable topics (direct-voice signaling between the two browsers; no audio, nothing stored).

`20261012000000_couple_photos.sql`: `couple_photos (couple_id, slot, user_id, path)` plus the private `couple-photos` bucket. These are the couple's two together photos and one portrait per partner, used on personalised game boards. Members read their own couple's rows and files (RLS); only the server writes.

`20261011000000_win_streaks.sql`: `win_streaks (couple_id, game_id, user_id, current, best, last_session)`. A trigger on `game_sessions` updates it when a streak-eligible session completes: the winner +1, the other player reset to 0. Couple members can read it (RLS); nobody writes it directly.

`20261010000000_question_usage.sql`: `question_usage (couple_id, game_id, question_id, used_at)` records which questions each couple has been given, so they aren't repeated. Row-level security is on with no policies, so only the server can read or write it.

Messages are kept (no automatic deletion). Read receipts, if added later, belong in a separate table keyed by `(user_id, couple_id)`.

## Planned tables

Created in the phase that needs them.

| Table | Purpose | User write access |
| --- | --- | --- |
| `couple_settings` | Preferences incl. mature-content opt-in | Couple |
| `app_streaks` | Daily together-streak | Server only |
| `leaderboard` | Couple's internal head-to-head records | Server only |
| `games` | Optional mirror of registry ids for FK integrity | Server only |
| `game_sessions` | `game_id`, `couple_id`, `status`, `state jsonb`, `result jsonb`, timestamps | Server only |
| `lobby_items` | Objects placed in the 3D room | Couple |
| `left_messages` | Notes left in the room for the partner | Couple |
| `question_bank` | Curated + AI-generated prompts | Server only |
| `notifications` | Per-user notifications | Own (read/dismiss) |
| `media_assets` | Metadata for Storage objects | Couple |

No seed or fake production data is ever committed.
