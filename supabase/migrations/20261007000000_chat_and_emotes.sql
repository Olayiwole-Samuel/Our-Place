-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — couple chat (persistent) and character emotes (realtime)
--
-- Chat
--   * public.messages is the source of truth; Realtime only DELIVERS new rows.
--   * Clients never write the table directly. public.send_message() is the only
--     write path: it derives the sender (auth.uid()) and the couple
--     (couple_members) itself, validates the text and rate-limits per user.
--   * Both partners read their couple's messages (RLS); nobody else can.
--   * After each insert, a trigger broadcasts the row on the couple's PRIVATE
--     chat topic. The payload is written by the database, so it can't be forged.
--
-- Emotes
--   * public.send_emote() validates the emote, rate-limits per user and
--     broadcasts { sender_id: auth.uid(), emote } on the couple's emotes topic.
--     Emotes are live character events, not chat rows; nothing is stored.
--
-- Realtime topics written by the database (chat, emotes, notifications) are
-- read-only for clients: the send policy below only lets clients broadcast on
-- the topics they own (presence for movement, lobby for future room sync). So a
-- client can neither fake a chat message nor send an emote "as" anyone.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- null only for system messages (application events).
  sender_id uuid references public.users (id) on delete restrict,
  type text not null default 'text' check (type in ('text', 'emote', 'system')),
  content text not null check (char_length(content) between 1 and 2000),
  -- Sender-generated id for the optimistic copy: makes retries idempotent and
  -- lets the sender match the confirmed row. The row id stays canonical.
  client_id uuid,
  created_at timestamptz not null default now(),
  constraint messages_sender_matches_type check ((type = 'system') = (sender_id is null)),
  constraint messages_client_id_unique unique (sender_id, client_id)
);

comment on table public.messages is
  'Couple chat. Written only by public.send_message() (and future server-side system events). Read receipts can be added as a separate table keyed by (user_id, couple_id).';

-- Newest-first pages within one couple (keyset on created_at, id).
create index messages_couple_created_idx on public.messages (couple_id, created_at desc, id desc);
-- Rate-limit lookups.
create index messages_sender_created_idx on public.messages (sender_id, created_at desc);

alter table public.messages enable row level security;

create policy "couple members read their couple's messages"
  on public.messages
  for select
  to authenticated
  using (private.is_couple_member(couple_id));

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;

-- ── Sending ─────────────────────────────────────────────────────────────────
-- Limits (mirrored in lib/chat/limits.js for instant client feedback):
--   2000 characters, at most 8 messages per 10 seconds per sender.
create function public.send_message(content text, client_id uuid default null)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid;
  body text;
  existing public.messages;
  inserted public.messages;
begin
  if uid is null then
    raise exception 'chat:not_authenticated';
  end if;
  cid := private.current_couple_id();
  if cid is null then
    raise exception 'chat:not_paired';
  end if;

  -- Strip control characters (keep newlines and tabs), then surrounding whitespace.
  body := regexp_replace(coalesce(content, ''), E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', '', 'g');
  body := btrim(body, E' \t\r\n');
  if body = '' then
    raise exception 'chat:empty';
  end if;
  if char_length(body) > 2000 then
    raise exception 'chat:too_long';
  end if;

  -- One sender at a time, so the rate limit and idempotency checks are exact.
  perform pg_advisory_xact_lock(hashtextextended('our_place.chat.' || uid::text, 0));

  if client_id is not null then
    select * into existing from public.messages m where m.sender_id = uid and m.client_id = send_message.client_id;
    if found then
      return existing; -- a retry of a message that already arrived
    end if;
  end if;

  if (select count(*) from public.messages m where m.sender_id = uid and m.created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'chat:rate_limited';
  end if;

  insert into public.messages (couple_id, sender_id, type, content, client_id)
  values (cid, uid, 'text', body, send_message.client_id)
  returning * into inserted;
  return inserted;
end;
$$;

comment on function public.send_message(text, uuid) is
  'The only chat write path. Sender and couple come from the session. Raises chat:<reason>.';

-- ── Realtime delivery ───────────────────────────────────────────────────────
create function private.broadcast_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'sender_id', new.sender_id,
        'type', new.type,
        'content', new.content,
        'client_id', new.client_id,
        'created_at', new.created_at
      ),
      'message',
      'our-place:couple:' || new.couple_id::text || ':chat',
      true
    );
  exception when others then
    -- Delivery is best-effort; the row is saved and clients catch up on reconnect.
    null;
  end;
  return null;
end;
$$;

create trigger broadcast_message
  after insert on public.messages
  for each row execute function private.broadcast_message();

-- ── Emotes ──────────────────────────────────────────────────────────────────
create table private.emote_rate (
  user_id uuid primary key references public.users (id) on delete cascade,
  last_at timestamptz not null
);

create function public.send_emote(emote text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid;
  previous timestamptz;
begin
  if uid is null then
    raise exception 'emote:not_authenticated';
  end if;
  cid := private.current_couple_id();
  if cid is null then
    raise exception 'emote:not_paired';
  end if;
  if emote is null or emote not in ('wave', 'laugh', 'cry', 'kiss', 'dance', 'angry', 'heart') then
    raise exception 'emote:invalid';
  end if;

  select r.last_at into previous from private.emote_rate r where r.user_id = uid for update;
  -- Client cooldown is 1.5 s; the server allows a little network jitter.
  if previous is not null and clock_timestamp() - previous < interval '1 second' then
    raise exception 'emote:rate_limited';
  end if;
  insert into private.emote_rate (user_id, last_at) values (uid, clock_timestamp())
  on conflict (user_id) do update set last_at = excluded.last_at;

  perform realtime.send(
    jsonb_build_object('sender_id', uid, 'emote', emote, 'at', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    'emote',
    'our-place:couple:' || cid::text || ':emotes',
    true
  );
end;
$$;

comment on function public.send_emote(text) is
  'Broadcasts a character emote to the caller''s couple as the caller. Raises emote:<reason>.';

-- ── Realtime send policy: clients only broadcast on client-owned topics ─────
create function private.can_send_couple_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_access_couple_topic(topic)
     and (
       topic = 'our-place:couple:' || private.current_couple_id()::text || ':presence'
       or topic = 'our-place:couple:' || private.current_couple_id()::text || ':lobby'
     );
$$;

comment on function private.can_send_couple_topic(text) is
  'Topics clients may broadcast/track on. chat, emotes and notifications are written by the database only.';

drop policy "couple members send their couple's presence and broadcasts" on realtime.messages;

create policy "couple members send on their couple's client topics"
  on realtime.messages
  for insert
  to authenticated
  with check (
    private.can_send_couple_topic((select realtime.topic()))
    and realtime.messages.extension in ('presence', 'broadcast')
  );

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on function public.send_message(text, uuid), public.send_emote(text) from public, anon;
grant execute on function public.send_message(text, uuid), public.send_emote(text) to authenticated;
revoke all on function private.broadcast_message() from public, anon, authenticated;
revoke all on function private.can_send_couple_topic(text) from public, anon;
grant execute on function private.can_send_couple_topic(text) to authenticated;
revoke all on private.emote_rate from public, anon, authenticated;

-- Required for chat delivery after a reconnect: nothing extra. Clients re-read
-- rows newer than their latest message from public.messages (RLS applies).
