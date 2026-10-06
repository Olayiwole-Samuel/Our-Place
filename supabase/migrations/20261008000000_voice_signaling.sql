-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — direct (peer-to-peer) voice signaling
--
-- Voice can run browser-to-browser (WebRTC) instead of through Daily. The two
-- browsers exchange connection details (offer/answer/ICE candidates and mic
-- state) as broadcasts on the couple's PRIVATE `voice` topic:
--
--   our-place:couple:<couple_id>:voice
--
-- Like presence, this topic is client-writable, and only the couple's two
-- members can join or send on it (same RLS as every couple topic). No audio
-- passes through Supabase; nothing is stored.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function private.can_send_couple_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_access_couple_topic(topic)
     and topic in (
       'our-place:couple:' || private.current_couple_id()::text || ':presence',
       'our-place:couple:' || private.current_couple_id()::text || ':lobby',
       'our-place:couple:' || private.current_couple_id()::text || ':voice'
     );
$$;

comment on function private.can_send_couple_topic(text) is
  'Topics clients may broadcast/track on (presence, lobby, voice signaling). chat, emotes and notifications are written by the database only.';
