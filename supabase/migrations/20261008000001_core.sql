-- Music Match core schema: profiles, posts (gigs), likes, comments, messages, file storage.
-- Every table has row-level security (RLS): the public anon key can only do what these
-- policies allow, so it's safe to ship that key in the website.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_.]{2,30}$'),
  name text not null default '' check (char_length(name) <= 80),
  role text not null default 'artist' check (role in ('artist', 'producer', 'videographer', 'studio', 'engineer')),
  also_roles text[] not null default '{}',
  country text not null default 'US' check (char_length(country) = 2),
  city text not null default '',
  lng double precision not null default -84.388 check (lng between -180 and 180),
  lat double precision not null default 33.749 check (lat between -90 and 90),
  address text check (char_length(address) <= 200),
  travel_miles int check (travel_miles between 0 and 1000),
  bio text not null default '' check (char_length(bio) <= 600),
  rate text not null default '' check (char_length(rate) <= 80),
  genres text[] not null default '{}',
  available boolean not null default true,
  socials jsonb not null default '[]' check (jsonb_typeof(socials) = 'array'),
  avatar_path text,
  banner_path text,
  featured_post_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_also_roles check (also_roles <@ array['artist', 'producer', 'videographer', 'studio', 'engineer'])
);

alter table public.profiles enable row level security;
create policy "Profiles are visible to everyone" on public.profiles for select using (true);
create policy "People can update their own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- A profile row is created automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, handle, name)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 8, 25),
    coalesce(left(new.raw_user_meta_data ->> 'name', 80), '')
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- posts (gigs)
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('collab', 'promo', 'question')),
  text text not null default '' check (char_length(text) <= 2200),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now()
);
create index posts_created_at_idx on public.posts (created_at desc);
create index posts_author_idx on public.posts (author_id);

alter table public.posts enable row level security;
create policy "Posts are visible to everyone" on public.posts for select using (true);
create policy "People can post as themselves" on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "People can delete their own posts" on public.posts for delete to authenticated
  using (author_id = (select auth.uid()));

alter table public.profiles add constraint profiles_featured_post_fk
  foreign key (featured_post_id) references public.posts on delete set null;

-- ---------------------------------------------------------------- likes & comments
create table public.post_likes (
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
create policy "Likes are visible to everyone" on public.post_likes for select using (true);
create policy "People can like as themselves" on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "People can remove their own likes" on public.post_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  text text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);
alter table public.comments enable row level security;
create policy "Comments are visible to everyone" on public.comments for select using (true);
create policy "People can comment as themselves" on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "People can delete their own comments" on public.comments for delete to authenticated
  using (author_id = (select auth.uid()));

-- ---------------------------------------------------------------- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles on delete cascade,
  recipient_id uuid not null references public.profiles on delete cascade,
  text text not null default '' check (char_length(text) <= 4000),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint not_to_self check (sender_id <> recipient_id)
);
create index messages_pair_idx on public.messages (sender_id, recipient_id, created_at);
create index messages_recipient_idx on public.messages (recipient_id, created_at);

alter table public.messages enable row level security;
create policy "People can read their own conversations" on public.messages for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));
create policy "People can send as themselves" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()));
create policy "People can delete messages in their conversations" on public.messages for delete to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

-- Marking read goes through this function so recipients can't edit message text.
create function public.mark_conversation_read(other uuid) returns void
language sql security definer set search_path = '' as $$
  update public.messages set read_at = now()
  where recipient_id = (select auth.uid()) and sender_id = other and read_at is null;
$$;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- New messages and posts arrive live in the browser.
alter publication supabase_realtime add table public.messages, public.posts, public.comments, public.post_likes;

-- ---------------------------------------------------------------- storage
-- `media`: profile pictures, banners and post files (public, so they can be shown to anyone).
-- `message-files`: attachments in DMs (private, only the two people in the conversation).
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 104857600), ('message-files', 'message-files', false, 104857600);

-- Paths are "<owner id>/<file>" for media and "<sender id>/<recipient id>/<file>" for messages.
create policy "People upload media into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "People delete their own media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Senders upload message files" on storage.objects for insert to authenticated
  with check (bucket_id = 'message-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Both people in a conversation can open its files" on storage.objects for select to authenticated
  using (
    bucket_id = 'message-files'
    and (select auth.uid())::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
  );
create policy "Senders delete their message files" on storage.objects for delete to authenticated
  using (bucket_id = 'message-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
