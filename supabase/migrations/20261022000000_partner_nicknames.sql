-- ─────────────────────────────────────────────────────────────────────────────
-- Partner nicknames: what each of you calls the other ("Baby", "My King"…).
-- Stored on YOUR membership row, so it's yours: you see your partner by the
-- name you chose everywhere in Our Place (room, chat, games, the "Us" page,
-- the name over their character); they still see their own name for
-- themselves, and the name YOU chose shows only on your screens. Phone
-- notifications you receive use it too.
--
-- Set only through set_partner_nickname() (couple_members stays read-only to
-- clients). Empty or null clears it (back to their account name).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.couple_members
  add column partner_nickname text,
  add constraint couple_members_partner_nickname_length check (partner_nickname is null or char_length(partner_nickname) between 1 and 30);

create function public.set_partner_nickname(nickname text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  -- Control characters out, inner whitespace collapsed, ends trimmed.
  clean text := btrim(regexp_replace(regexp_replace(coalesce(nickname, ''), E'[\\x01-\\x1F\\x7F]', '', 'g'), E'\\s+', ' ', 'g'));
begin
  if uid is null then raise exception 'pairing:not_authenticated'; end if;
  if char_length(clean) > 30 then raise exception 'pairing:invalid_request'; end if;
  update public.couple_members set partner_nickname = nullif(clean, '') where user_id = uid;
  if not found then raise exception 'pairing:not_paired'; end if;
  return nullif(clean, '');
end;
$$;

revoke all on function public.set_partner_nickname(text) from public, anon;
grant execute on function public.set_partner_nickname(text) to authenticated;
