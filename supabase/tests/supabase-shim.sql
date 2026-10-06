-- Minimal stand-in for the parts of a Supabase database that our migrations
-- depend on, so the real migration files can run in PGlite for tests.
-- Mirrors Supabase's definitions; never applied to a real project.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Same resolution order as Supabase's auth.uid().
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Realtime Authorization: Supabase evaluates RLS on realtime.messages with
-- realtime.topic() returning the channel topic being joined or sent to.
create schema realtime;
grant usage on schema realtime to anon, authenticated, service_role;

create table realtime.messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  inserted_at timestamp not null default now(),
  updated_at timestamp not null default now()
);
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to anon, authenticated;

create function realtime.topic() returns text
language sql stable
as $$
  select nullif(current_setting('realtime.topic', true), '')::text;
$$;
grant execute on function realtime.topic() to anon, authenticated, service_role;

-- Supabase's database-originated broadcast (realtime.send). Runs as the caller;
-- Our Place only calls it from security-definer functions.
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql
as $$
  insert into realtime.messages (topic, extension, payload, event, private) values ($3, 'broadcast', $1, $2, $4);
$$;

-- Storage: the minimum of Supabase's storage schema our migrations use.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- Same semantics as Supabase's storage.foldername(): path segments except the file.
create function storage.foldername(name text) returns text[]
language sql immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
