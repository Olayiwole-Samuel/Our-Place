-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — users, couples and pairing
--
-- Model
--   users           one row per auth user, created/synced by trigger from auth.users
--   couple_invites  six-character invite codes and their lifecycle
--   couples         an immutable pair of exactly two distinct users
--   couple_members  one row per paired user — the membership index RLS relies on
--
-- Guarantees enforced by the database itself (not by the app):
--   * a user belongs to at most one couple         couple_members.user_id is the PK
--   * a couple has exactly two distinct members    slot in (1,2) + unique(couple_id, slot),
--                                                  user1 <> user2, deferred consistency trigger
--   * invite codes are random, well-formed, never reused   check + unique(code)
--   * a user has at most one active invite         partial unique index
--   * clients cannot write any of these tables     no INSERT/UPDATE/DELETE grants or policies;
--                                                  pairing happens only in the two functions below
--   * identity comes from the JWT (auth.uid()), never from function arguments
--   * invite-code guessing is throttled (10 failed joins per user per 15 minutes)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── users ───────────────────────────────────────────────────────────────────
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  avatar_thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Profile for each authenticated user. Created and synced from auth.users by trigger.';
comment on column public.users.avatar_url is 'Profile picture (from Google at sign-in).';
comment on column public.users.avatar_thumbnail is 'Thumbnail of the 3D avatar, once one is generated (later phase).';

create trigger set_updated_at before update on public.users
  for each row execute function private.set_updated_at();

-- Creates/updates the profile from the identity provider's metadata. Runs as the
-- table owner, so it works even though clients have no write access to users.
create function private.sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  picture text := coalesce(meta ->> 'avatar_url', meta ->> 'picture');
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(trim(meta ->> 'full_name'), ''), nullif(trim(meta ->> 'name'), ''),
                  nullif(split_part(coalesce(new.email, ''), '@', 1), ''), ''), 80),
    case when picture ~ '^https://' then picture end
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.sync_user_profile();

create trigger on_auth_user_updated after update of email, raw_user_meta_data on auth.users
  for each row execute function private.sync_user_profile();

-- Backfill profiles for any accounts that existed before this migration.
insert into public.users (id, email, display_name, avatar_url)
select
  u.id,
  u.email,
  left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
                nullif(split_part(coalesce(u.email, ''), '@', 1), ''), ''), 80),
  case when coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') ~ '^https://'
       then coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') end
from auth.users u
on conflict (id) do nothing;

-- ── couples ─────────────────────────────────────────────────────────────────
-- Pairing is permanent: there is no unpair path, and deleting a paired user is
-- blocked (on delete restrict) so it can only happen through deliberate admin action.
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references public.users (id) on delete restrict,
  user2_id uuid not null references public.users (id) on delete restrict,
  invite_code text not null,
  paired_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint couples_distinct_partners check (user1_id <> user2_id),
  constraint couples_user1_unique unique (user1_id),
  constraint couples_user2_unique unique (user2_id),
  constraint couples_invite_code_unique unique (invite_code)
);

comment on table public.couples is 'Exactly two distinct users. Created only by public.join_couple().';

create table public.couple_members (
  user_id uuid primary key references public.users (id) on delete restrict,
  couple_id uuid not null references public.couples (id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  joined_at timestamptz not null default now(),
  constraint couple_members_slot_unique unique (couple_id, slot)
);

comment on table public.couple_members is
  'Membership index: PK on user_id = one couple per user; (couple_id, slot) unique = max two per couple.';

-- couples.user1_id/user2_id and couple_members must always describe the same two
-- people. Checked at commit (deferred) so the pairing function can insert both.
create function private.assert_couple_consistent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid;
  consistent boolean;
begin
  if tg_table_name = 'couples' then
    target := coalesce(new.id, old.id);
  else
    target := coalesce(new.couple_id, old.couple_id);
  end if;

  select (select count(*) from public.couple_members m where m.couple_id = c.id) = 2
     and exists (select 1 from public.couple_members m where m.couple_id = c.id and m.user_id = c.user1_id and m.slot = 1)
     and exists (select 1 from public.couple_members m where m.couple_id = c.id and m.user_id = c.user2_id and m.slot = 2)
    into consistent
  from public.couples c
  where c.id = target;

  -- No couple row (e.g. deleted) means nothing to check.
  if consistent is false then
    raise exception 'couple % membership is inconsistent', target using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger couples_consistent
  after insert or update on public.couples
  deferrable initially deferred
  for each row execute function private.assert_couple_consistent();

create constraint trigger couple_members_consistent
  after insert or update or delete on public.couple_members
  deferrable initially deferred
  for each row execute function private.assert_couple_consistent();

-- ── couple_invites ──────────────────────────────────────────────────────────
-- Alphabet: A–Z and 2–9 without the ambiguous 0/O, 1/I/L (31 symbols).
create table public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  created_by uuid not null references public.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'used', 'revoked', 'expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  used_by uuid references public.users (id) on delete set null,
  used_at timestamptz,
  couple_id uuid references public.couples (id) on delete set null,
  constraint couple_invites_code_unique unique (code),
  constraint couple_invites_used_fields check (status <> 'used' or used_at is not null),
  constraint couple_invites_not_self check (used_by is null or used_by <> created_by)
);

comment on table public.couple_invites is 'Invite codes. Codes are unique forever, so a used code can never be reused.';

create unique index couple_invites_one_active_per_user on public.couple_invites (created_by) where status = 'active';
create index couple_invites_used_by_idx on public.couple_invites (used_by);
create index couple_invites_couple_id_idx on public.couple_invites (couple_id);
create index couple_members_couple_id_idx on public.couple_members (couple_id);

-- Cryptographically random code. gen_random_uuid() draws from pg_strong_random();
-- the version/variant bytes are skipped and rejection sampling removes modulo bias.
create function private.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
  byte int;
  code text := '';
begin
  while char_length(code) < 6 loop
    random_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    for i in 0..15 loop
      continue when i in (6, 8);
      byte := get_byte(random_bytes, i);
      continue when byte >= 248; -- 248 = 31 * 8
      code := code || substr(alphabet, (byte % 31) + 1, 1);
      exit when char_length(code) = 6;
    end loop;
  end loop;
  return code;
end;
$$;

-- Serialises all pairing operations that involve the same user.
create function private.lock_user(target uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('our_place.pairing.' || target::text, 0));
$$;

-- ── RLS helpers ─────────────────────────────────────────────────────────────
-- security definer so policies can consult membership without recursive RLS.
create function private.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.couple_id from public.couple_members m where m.user_id = (select auth.uid());
$$;

create function private.is_couple_member(target_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_couple_id is not null and target_couple_id = private.current_couple_id();
$$;

create function private.current_partner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id from public.couple_members m
  where m.couple_id = private.current_couple_id() and m.user_id <> (select auth.uid());
$$;

-- ── Pairing functions (the only write path) ─────────────────────────────────
-- Reasons ('already_paired', 'invalid_code', …) are mapped to user-facing copy in
-- lib/couple/errors.js. create_couple_invite raises 'pairing:<reason>'; join_couple
-- returns its business failures. Neither function accepts a user id or couple id.

create function public.create_couple_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  invite public.couple_invites;
  attempt int := 0;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'pairing:not_authenticated';
  end if;

  perform private.lock_user(uid);

  if not exists (select 1 from public.users u where u.id = uid) then
    raise exception using errcode = 'P0001', message = 'pairing:profile_missing';
  end if;
  if exists (select 1 from public.couple_members m where m.user_id = uid) then
    raise exception using errcode = 'P0001', message = 'pairing:already_paired';
  end if;

  update public.couple_invites i set status = 'expired'
  where i.created_by = uid and i.status = 'active' and i.expires_at <= now();

  -- Idempotent: reopening the screen shows the same live code.
  select * into invite from public.couple_invites i where i.created_by = uid and i.status = 'active';
  if not found then
    loop
      attempt := attempt + 1;
      begin
        insert into public.couple_invites (code, created_by)
        values (private.generate_invite_code(), uid)
        returning * into invite;
        exit;
      exception when unique_violation then
        if attempt >= 8 then
          raise;
        end if;
      end;
    end loop;
  end if;

  return query select invite.code, invite.expires_at;
end;
$$;

-- Failed join attempts, for brute-force throttling of invite codes. Private: no API access.
create table private.pairing_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  reason text not null,
  attempted_at timestamptz not null default now()
);
create index pairing_attempts_user_time_idx on private.pairing_attempts (user_id, attempted_at desc);

-- The pairing transaction itself. Returns (couple_id, null) on success or
-- (null, reason) on a business-rule failure, so the caller can record the attempt.
create function private.try_join_couple(uid uuid, normalized text)
returns table (couple_id uuid, error text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  invite public.couple_invites;
  new_couple_id uuid;
begin
  if normalized !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then
    return query select null::uuid, 'invalid_code'; return;
  end if;

  select * into invite from public.couple_invites i where i.code = normalized;
  if not found then
    return query select null::uuid, 'invalid_code'; return;
  end if;
  if invite.created_by = uid then
    return query select null::uuid, 'self_pair'; return;
  end if;

  -- Lock both people in a fixed order (no deadlocks), then re-read under the lock.
  -- Any concurrent pairing involving either user waits here and then sees the result.
  perform private.lock_user(least(uid, invite.created_by));
  perform private.lock_user(greatest(uid, invite.created_by));
  select * into invite from public.couple_invites i where i.id = invite.id for update;

  if exists (select 1 from public.couple_members m where m.user_id = uid) then
    return query select null::uuid, 'already_paired'; return;
  end if;
  if invite.status <> 'active' or invite.expires_at <= now() then
    return query select null::uuid, 'invite_unavailable'; return;
  end if;
  if exists (select 1 from public.couple_members m where m.user_id = invite.created_by) then
    return query select null::uuid, 'couple_complete'; return;
  end if;

  insert into public.couples (user1_id, user2_id, invite_code)
  values (invite.created_by, uid, invite.code)
  returning id into new_couple_id;

  insert into public.couple_members (user_id, couple_id, slot)
  values (invite.created_by, new_couple_id, 1), (uid, new_couple_id, 2);

  update public.couple_invites i
  set status = 'used', used_by = uid, used_at = now(), couple_id = new_couple_id
  where i.id = invite.id;

  -- The joiner may have had their own invite open; it can never be used now.
  update public.couple_invites i set status = 'revoked' where i.created_by = uid and i.status = 'active';

  return query select new_couple_id, null::text;
end;
$$;

-- Public entry point. Business failures are returned (not raised) so the failed
-- attempt is committed and counts toward the throttle: 10 failures / 15 minutes.
create function public.join_couple(invite_code text)
returns table (couple_id uuid, error text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  result record;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'pairing:not_authenticated';
  end if;
  if not exists (select 1 from public.users u where u.id = uid) then
    raise exception using errcode = 'P0001', message = 'pairing:profile_missing';
  end if;

  if (select count(*) from private.pairing_attempts a
      where a.user_id = uid and a.attempted_at > now() - interval '15 minutes') >= 10 then
    return query select null::uuid, 'rate_limited'; return;
  end if;

  select * into result
  from private.try_join_couple(uid, upper(regexp_replace(coalesce(invite_code, ''), '[\s-]', '', 'g')));

  if result.error is not null then
    insert into private.pairing_attempts (user_id, reason) values (uid, result.error);
  end if;

  return query select result.couple_id, result.error;
end;
$$;

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_invites enable row level security;

create policy "users: read self and partner" on public.users
  for select to authenticated
  using (id = (select auth.uid()) or id = private.current_partner_id());

create policy "couples: members read their couple" on public.couples
  for select to authenticated
  using (private.is_couple_member(id));

create policy "couple_members: members read their couple" on public.couple_members
  for select to authenticated
  using (couple_id = private.current_couple_id());

create policy "couple_invites: creators read their invites" on public.couple_invites
  for select to authenticated
  using (created_by = (select auth.uid()));

-- ── Privileges (least privilege; Supabase grants broad defaults on public) ──
revoke all on public.users, public.couples, public.couple_members, public.couple_invites from anon, authenticated;

-- Email is not granted: a partner never reads the other's email through the API.
grant select (id, display_name, avatar_url, avatar_thumbnail, created_at) on public.users to authenticated;
grant select on public.couples, public.couple_members to authenticated;
grant select (id, code, status, expires_at, created_at, used_at) on public.couple_invites to authenticated;

revoke all on function public.create_couple_invite(), public.join_couple(text) from public, anon;
grant execute on function public.create_couple_invite(), public.join_couple(text) to authenticated;

revoke all on function private.current_couple_id(), private.is_couple_member(uuid), private.current_partner_id(),
  private.generate_invite_code(), private.lock_user(uuid), private.sync_user_profile(),
  private.assert_couple_consistent(), private.try_join_couple(uuid, text)
  from public, anon, authenticated;
revoke all on private.pairing_attempts from public, anon, authenticated;
grant execute on function private.current_couple_id(), private.is_couple_member(uuid), private.current_partner_id()
  to authenticated;
