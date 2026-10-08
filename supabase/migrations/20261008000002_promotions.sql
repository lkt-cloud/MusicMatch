-- Paid promotions (Stripe). Rows are only ever created or changed by the server
-- (Edge Functions using the service-role key) — never by the browser — and a
-- promotion only becomes 'active' when Stripe's webhook confirms the payment.

-- Each user's Stripe customer id, so repeat purchases share one customer.
create table public.stripe_customers (
  user_id uuid primary key references auth.users on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);
alter table public.stripe_customers enable row level security;
-- (no policies: only the server can read or write this table)

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  type text not null check (type in ('boost_post', 'featured_profile', 'studio_listing')),
  post_id uuid references public.posts on delete cascade,
  -- pending: checkout started · active: paid · past_due: renewal failed (off) ·
  -- canceled: ended by the user or Stripe · expired: ran out (boosts after 7 days)
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled', 'expired')),
  starts_at timestamptz,
  ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boost_targets_a_post check ((type = 'boost_post') = (post_id is not null))
);
create index promotions_user_idx on public.promotions (user_id, created_at desc);
create index promotions_live_idx on public.promotions (type, status, ends_at);

alter table public.promotions enable row level security;
create policy "People can see their own promotions" on public.promotions for select to authenticated
  using (user_id = (select auth.uid()));
-- (no insert/update/delete policies: the browser can't create or activate promotions)

create trigger promotions_touch before update on public.promotions
  for each row execute function public.touch_updated_at();

-- What everyone can see: which posts/profiles are promoted right now. No Stripe ids or
-- payment details leave the table. The time check means a promotion switches off at
-- `ends_at` even if a scheduled job or webhook is late.
create view public.active_promotions as
  select id, user_id, type, post_id, starts_at, ends_at
  from public.promotions
  where status = 'active'
    and starts_at <= now()
    and (ends_at is null or ends_at > now());
grant select on public.active_promotions to anon, authenticated;

-- Tidy-up job: mark finished promotions as expired every 15 minutes.
-- (pg_cron is available on Supabase; skipped quietly where it isn't, e.g. local tests.)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'expire-promotions',
      '*/15 * * * *',
      $job$update public.promotions set status = 'expired'
           where status = 'active' and ends_at is not null and ends_at <= now()$job$
    );
  end if;
end;
$$;
