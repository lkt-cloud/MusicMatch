-- Report and block (App Store guideline 1.2 for apps with user-generated content).
--
--  * blocks:  who has blocked whom. The app hides a blocked person's posts, comments, profile
--             and conversation; the database also refuses messages between two people when
--             either has blocked the other.
--  * reports: write-only for the app. Nobody can read them through the public key; you review
--             them in the Supabase dashboard (Table Editor > reports).

-- ---------------------------------------------------------------- blocks
create table public.blocks (
  blocker_id uuid not null references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint not_self_block check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
create policy "People can see who they blocked" on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "People can block as themselves" on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy "People can unblock" on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- True when either person has blocked the other. Security definer so a sender can't read
-- someone else's block list, only learn that sending isn't allowed.
create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

drop policy "People can send as themselves" on public.messages;
create policy "People can send as themselves" on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and not public.is_blocked_between(sender_id, recipient_id)
  );

-- ---------------------------------------------------------------- reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles on delete cascade,
  reported_user_id uuid references public.profiles on delete set null,
  target_type text not null check (target_type in ('post', 'comment', 'profile', 'message')),
  target_id text not null check (char_length(target_id) <= 64),
  reason text not null check (reason in ('spam', 'harassment', 'sexual', 'violence', 'impersonation', 'copyright', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  created_at timestamptz not null default now()
);
create index reports_created_idx on public.reports (created_at desc);

alter table public.reports enable row level security;
-- Insert only: no select/update/delete policy, so reports can't be read or changed with the public key.
create policy "People can report as themselves" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and reporter_id is distinct from reported_user_id);
