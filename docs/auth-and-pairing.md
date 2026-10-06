# Authentication & pairing

How a person gets from "Open Our Place" to their couple's world, and how that is kept secure.

## Flow

```text
GET /  (server)
  └─ resolveViewer()                      lib/auth/viewer.js
       ├─ Supabase config invalid  → "unconfigured"  → Welcome, sign-in disabled + explained
       ├─ auth.getUser() fails (network/5xx) → "unavailable" → "We couldn't connect" + Try again
       ├─ no / expired / invalid session  → "signed_out"   → Welcome
       └─ signed in → loadCoupleState()   lib/couple/server.js
            ├─ unpaired → Pairing (invite or join)
            └─ paired   → Our Place (3D world)
```

Everything above runs on the server **before the first byte of HTML**, so there is no login flash and no pairing flash. `app/loading.js` shows the branded loading screen while the server resolves.

On the client, `components/app/AppProviders.jsx` creates two stores from that result, and `components/app/AppStage.jsx` picks the screen with `selectStage(authStatus, coupleStatus, justPaired)`.

### Sign-in (Google via Supabase Auth, PKCE)

1. **Continue with Google** → `signInWithGoogle()` (`lib/auth/client.js`) → Google's account chooser (`prompt=select_account`).
2. Google → Supabase → `GET /auth/callback?code=…` (`app/auth/callback/route.js`) → `exchangeCodeForSession` sets the session cookies.
3. The callback always redirects to `/`. It has no `next` parameter, so it can't be used as an open redirect. Failures redirect to `/?auth_error=failed|cancelled`, which the welcome screen explains.
4. A database trigger (`private.sync_user_profile`) has already created the `public.users` row from the Google identity: name, https-only picture, email. It re-syncs whenever Google metadata changes.

### Session handling

| Situation | Behaviour |
| --- | --- |
| Initial load / restore | Server reads the cookie and verifies it with `auth.getUser()` (never `getSession()`) |
| Token refresh | `middleware.js` refreshes the cookie on each request; an outage there never breaks the page |
| Expired / revoked / invalid | Treated as signed out → Welcome |
| Supabase unreachable | `unavailable` (not signed out) → retry screen |
| API call finds the session ended | Toast "Your session ended…" → `router.refresh()` → Welcome |
| Sign-out | `signOut({ scope: "local" })` → branded loading → `router.refresh()` → Welcome + toast |
| Signed out / switched account in another tab | `onAuthStateChange` sees a different user → `router.refresh()` |

Sessions live in cookies managed by `@supabase/ssr`. Nothing about identity or membership is stored in `localStorage`.

### Pairing

| Step | Where | What happens |
| --- | --- | --- |
| Create invite | `POST /api/couple/invite` → `public.create_couple_invite()` | Returns the caller's active invite or creates one. 6 chars from a 31-symbol alphabet without 0/O/1/I/L, cryptographically random (`gen_random_uuid` bytes + rejection sampling). Valid 7 days, single-use. |
| Wait | `InviteCodePanel` | Polls `GET /api/couple` every 4 s while the tab is visible. Pairing flips the store to `paired`, which shows the celebration. |
| Join | `POST /api/couple/join {code}` → `public.join_couple(invite_code)` | Validates, locks both users, creates the couple + both memberships, marks the invite used, revokes the joiner's own invite. Returns the new state. |
| Celebrate | `PairingSuccess` | Shown once (`justPaired`), then the world. Returning users never see pairing again. |

There is no leave, unpair, swap or "add partner" control anywhere in the product.

## Security model

- **Identity is only ever `auth.uid()`** from the verified JWT. `create_couple_invite()` takes no arguments; `join_couple()` takes only the code. There is no parameter through which a user id or couple id can be supplied (tested).
- **The routes ignore everything except `code`.** A forged `userId`/`coupleId`/`user1Id` in the body never reaches the database (tested).
- **Atomic pairing.** Both users are locked with transaction-scoped advisory locks in a fixed order (no deadlocks) and the invite row is re-read `FOR UPDATE`. The schema itself also forbids bad states, even if the function were bypassed:
  - `couple_members.user_id` is the primary key → one couple per user
  - `unique (couple_id, slot)` with `slot in (1,2)` → at most two members
  - `check (user1_id <> user2_id)` → no self-couples
  - a deferred consistency trigger → a couple always has exactly its two members
  - `unique (code)` forever → codes can't be reused
- **No client writes.** `authenticated` has `SELECT` only (column-limited), and no `INSERT`/`UPDATE`/`DELETE` on any pairing table. Partners can't read each other's email.
- **RLS:** users see their own profile and their partner's; members see only their couple; creators see only their own invites (no code enumeration); anonymous requests see nothing.
- **Brute-force throttle:** 10 failed joins per user per 15 minutes, enforced inside the database (so calling the RPC directly can't bypass it).
- **CSRF:** writes require `Origin` to equal our origin and `Content-Type: application/json`; auth cookies are `SameSite=Lax`.
- **Errors:** users only ever see the copy in `lib/couple/errors.js`; raw Postgres/Supabase messages are logged, never returned.

## One-time setup (Supabase + Google)

1. **Environment** — `.env.local` (or `.env`):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co` (Project Settings → API → Project URL). The app validates this and disables sign-in with a console warning if it isn't a URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **anon** (or publishable) key.
   - `SUPABASE_SERVICE_ROLE_KEY` = optional; nothing in Phase 2 uses it.
2. **Apply migrations** — either `npx supabase link --project-ref <ref>` then `npx supabase db push`, or paste the files in `supabase/migrations/` (in order) into the SQL editor.
3. **Google OAuth** — in Google Cloud Console create an OAuth client (Web). Set the authorised redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`. In Supabase → Authentication → Providers → Google, paste the client ID and secret.
4. **Redirect URLs** — Supabase → Authentication → URL Configuration: set Site URL to your production origin and add `http://localhost:3000/auth/callback` (plus your production `/auth/callback`) to Redirect URLs.
5. **Realtime** — Supabase → Realtime → Settings: turn **off** "Allow public access". Presence uses private channels authorized by RLS; with public access on, a client could open a public channel on the same topic.
6. Optionally disable the Email provider (Google is the only sign-in method).

## Developer workflow

```bash
npm run dev
```

1. Browser A (normal window): sign in with Google account A → pairing screen. A `users` row exists.
2. **Create invite** → note the code → **Copy code**.
3. Browser B (another browser or a private window): sign in with Google account B → **I have an invite code** → enter the code → **Join**.
4. B sees "You're together." A sees the same within ~4 s. Both enter `/lobby`.
5. Refresh both → both land straight in the living room (`/` redirects paired couples to `/lobby`).
6. Presence: A sees B's avatar and "Here with you"; move B → A sees smooth movement; close B → A sees "Reconnecting…" then "Not here yet" (or immediately on a deliberate leave); reopen B → B reappears.
7. Sign out (⋯ menu) → Welcome. Sign back in → straight into Our Place, no pairing.

Verify in the SQL editor:

```sql
select c.id, a.display_name as user1, b.display_name as user2, c.paired_at
from couples c join users a on a.id = c.user1_id join users b on b.id = c.user2_id;
```

### Negative checks

| Try | Expected message |
| --- | --- |
| A enters A's own code | You can't use your own invite. |
| C enters A/B's (used) code | This invite is no longer available. |
| A (paired) creates an invite (e.g. via `fetch('/api/couple/invite', …)`) | You're already paired. |
| C joins via an invite whose creator is already in a couple | This couple is already complete. |
| Any made-up code | That invite code isn't valid. |
| 11th wrong code within 15 min | Too many tries. Wait a few minutes, then try again. |

## Tests

- `supabase/tests/pairing.test.js` — runs the **real migrations** in real Postgres (PGlite) with Supabase's roles and `auth.uid()`. Covers profiles, invites, every pairing rule, RLS isolation, forged writes, throttling and schema constraints. It has been mutation-checked: opening the users policy, or removing the self-pair check, makes it fail.
- `app/api/couple/routes.test.js`, `app/auth/callback/route.test.js` — the route handlers: unauthenticated access, CSRF, forged payloads, error mapping, open-redirect.
- `lib/auth/session.test.js` — session classification (missing / expired / network).
- `store/coupleStore.test.js` — state transitions and screen selection.
- `components/**/*.test.jsx` — code input (typing, paste, backspace, Enter), join and invite panels, welcome and error states (jsdom).

**Not covered by automated tests:** true concurrent transactions. PGlite is single-connection, so the race protections (advisory locks + constraints) are verified structurally, not by running two transactions at once.
