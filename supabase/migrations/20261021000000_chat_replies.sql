-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — chat replies (swipe a message to answer it, WhatsApp-style)
--
--   * public.messages.reply_to points at the message being answered. It is
--     optional (most messages aren't replies) and becomes null if that message
--     is ever deleted, so a reply never disappears with its original.
--   * A reply can only point at a message of the SAME couple. The foreign key is
--     on (couple_id, reply_to), so the database itself refuses anything else —
--     not just send_message(), which also checks and raises chat:invalid_reply.
--   * send_message() gains an optional reply_to argument; calls without it work
--     exactly as before. The realtime payload now carries reply_to too.
--
-- The app keeps working before this is applied: it notices the missing column
-- and simply hides replies.
-- ─────────────────────────────────────────────────────────────────────────────

-- The composite foreign key needs a unique key to point at. id alone is already
-- unique, so this never rejects a row; it only lets (couple_id, id) be referenced.
alter table public.messages
  add constraint messages_couple_id_id_key unique (couple_id, id);

alter table public.messages
  add column reply_to uuid,
  add constraint messages_reply_to_not_self check (reply_to is null or reply_to <> id),
  -- "set null (reply_to)" clears only the pointer; couple_id stays as it is.
  add constraint messages_reply_to_same_couple
    foreign key (couple_id, reply_to) references public.messages (couple_id, id)
    on delete set null (reply_to);

comment on column public.messages.reply_to is
  'The message this one answers (same couple only; null when it is not a reply or the original was deleted).';

-- Foreign keys are always indexed (deletes look replies up by it).
create index messages_reply_to_idx on public.messages (couple_id, reply_to) where reply_to is not null;

-- ── Sending ─────────────────────────────────────────────────────────────────
-- Same rules as before (see 20261007000000_chat_and_emotes.sql), plus reply_to.
-- The old two-argument version is replaced, so there is never an ambiguous call.
drop function public.send_message(text, uuid);

create function public.send_message(content text, client_id uuid default null, reply_to uuid default null)
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

  if send_message.client_id is not null then
    select * into existing from public.messages m where m.sender_id = uid and m.client_id = send_message.client_id;
    if found then
      return existing; -- a retry of a message that already arrived
    end if;
  end if;

  -- Only a message this couple can see can be answered (the foreign key agrees).
  if send_message.reply_to is not null
     and not exists (select 1 from public.messages m where m.id = send_message.reply_to and m.couple_id = cid) then
    raise exception 'chat:invalid_reply';
  end if;

  if (select count(*) from public.messages m where m.sender_id = uid and m.created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'chat:rate_limited';
  end if;

  insert into public.messages (couple_id, sender_id, type, content, client_id, reply_to)
  values (cid, uid, 'text', body, send_message.client_id, send_message.reply_to)
  returning * into inserted;
  return inserted;
end;
$$;

comment on function public.send_message(text, uuid, uuid) is
  'The only chat write path. Sender and couple come from the session; reply_to must be a message of the same couple. Raises chat:<reason>.';

-- ── Realtime delivery: the payload includes reply_to ────────────────────────
create or replace function private.broadcast_message()
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
        'reply_to', new.reply_to,
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

-- ── Privileges (dropping the function dropped its grants) ───────────────────
revoke all on function public.send_message(text, uuid, uuid) from public, anon;
grant execute on function public.send_message(text, uuid, uuid) to authenticated;

-- Let the Data API see the new column and argument straight away.
notify pgrst, 'reload schema';
