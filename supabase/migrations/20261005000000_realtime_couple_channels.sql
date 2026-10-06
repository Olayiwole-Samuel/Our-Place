-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — Realtime authorization for couple channels
--
-- Presence and broadcast run on PRIVATE Realtime channels. Supabase Realtime
-- authorizes every join/send of a private channel by evaluating RLS on
-- realtime.messages with realtime.topic() set to the channel's topic.
--
-- Topic format (lib/realtime/channels.js):  our-place:couple:<couple_id>:<channel>
--
-- A user may join or send on a topic only if <couple_id> is THEIR couple, as
-- resolved from their JWT via couple_members — never from anything the client
-- sends. Unpaired users and anonymous clients match nothing.
--
-- Required project setting (cannot be set from SQL): Realtime → Settings →
-- disable "Allow public access", so clients cannot bypass these policies by
-- opening a public channel on the same topic.
-- ─────────────────────────────────────────────────────────────────────────────

create function private.can_access_couple_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select topic is not null
     and private.current_couple_id() is not null
     and starts_with(topic, 'our-place:couple:' || private.current_couple_id()::text || ':');
$$;

comment on function private.can_access_couple_topic(text) is
  'True when the Realtime topic belongs to the caller''s couple (our-place:couple:<couple_id>:<channel>).';

revoke all on function private.can_access_couple_topic(text) from public, anon;
grant execute on function private.can_access_couple_topic(text) to authenticated;

create policy "couple members receive their couple's presence and broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    private.can_access_couple_topic((select realtime.topic()))
    and realtime.messages.extension in ('presence', 'broadcast')
  );

create policy "couple members send their couple's presence and broadcasts"
  on realtime.messages
  for insert
  to authenticated
  with check (
    private.can_access_couple_topic((select realtime.topic()))
    and realtime.messages.extension in ('presence', 'broadcast')
  );
