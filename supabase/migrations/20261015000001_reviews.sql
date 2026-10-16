-- Reviews: after a confirmed session ends, the client rates the provider (1–5 stars and an
-- optional comment). Each profile keeps its average and count, which only reviews can change.
-- An hour after a session, the client is reminded to leave one; the provider is told when
-- they get one.

-- ---------------------------------------------------------------- reviews
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings on delete cascade,
  reviewer_id uuid not null references public.profiles on delete cascade,
  reviewee_id uuid not null references public.profiles on delete cascade,
  service text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, reviewer_id)
);
create index reviews_reviewee_idx on public.reviews (reviewee_id, created_at desc);
create index reviews_reviewer_idx on public.reviews (reviewer_id);
alter table public.reviews enable row level security;
create policy "Reviews are visible to everyone" on public.reviews for select using (true);
-- Writing goes through submit_review below.

-- ---------------------------------------------------------------- the rating on each profile
alter table public.profiles
  add column rating numeric(2, 1) not null default 0,
  add column review_count int not null default 0;

create function public.refresh_rating(u uuid) returns void language sql security definer set search_path = '' as $$
  update public.profiles p
  set rating = coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.reviewee_id = u), 0),
      review_count = (select count(*) from public.reviews r where r.reviewee_id = u)
  where p.id = u;
$$;

create function public.on_review_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then perform public.refresh_rating(old.reviewee_id); end if;
  if tg_op <> 'DELETE' then perform public.refresh_rating(new.reviewee_id); end if;
  return null;
end;
$$;
create trigger reviews_rating after insert or update or delete on public.reviews
  for each row execute function public.on_review_change();

-- People can edit their own profile, but not their rating: a direct edit keeps the old values.
-- (The update from on_review_change runs one trigger level deeper, so it goes through.)
create function public.protect_rating() returns trigger language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() <= 1 then
    new.rating := old.rating;
    new.review_count := old.review_count;
  end if;
  return new;
end;
$$;
create trigger profiles_protect_rating before update on public.profiles
  for each row execute function public.protect_rating();

-- ---------------------------------------------------------------- leaving a review
create function public.submit_review(p_booking uuid, p_rating int, p_comment text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  b public.bookings;
  existed boolean;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.client_id <> me then raise exception 'Booking not found'; end if;
  if b.status <> 'confirmed' then raise exception 'Only confirmed sessions can be reviewed.'; end if;
  if b.ends_at > now() then raise exception 'You can review the session once it’s over.'; end if;
  if b.ends_at < now() - interval '60 days' then raise exception 'Reviews can be left up to 60 days after a session.'; end if;
  if p_rating not between 1 and 5 then raise exception 'Pick 1 to 5 stars.'; end if;

  select exists (select 1 from public.reviews where booking_id = b.id and reviewer_id = me) into existed;
  insert into public.reviews (booking_id, reviewer_id, reviewee_id, service, rating, comment)
  values (b.id, me, b.provider_id, b.service, p_rating, left(coalesce(p_comment, ''), 500))
  on conflict (booking_id, reviewer_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now();

  if not existed then
    perform public.notify(b.provider_id, 'review', public.display_name(me) || ' left you a ' || p_rating || '-star review',
      coalesce(nullif(left(p_comment, 140), ''), 'For your ' || public.service_label(b.service) || '.'),
      '/me', me, b.id, true, 'bookings');
  end if;
end;
$$;
revoke execute on function public.submit_review(uuid, int, text) from public, anon;
grant execute on function public.submit_review(uuid, int, text) to authenticated;
revoke execute on function public.refresh_rating(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- new kinds
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message', 'booking_request', 'booking_confirmed', 'booking_declined', 'booking_cancelled', 'reminder', 'review_request', 'review'));
alter table public.booking_reminders drop constraint booking_reminders_kind_check;
alter table public.booking_reminders add constraint booking_reminders_kind_check
  check (kind in ('week', 'days', 'tomorrow', 'morning', 'hours', 'soon', 'review'));
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'profile', 'message', 'review'));

-- ---------------------------------------------------------------- the "how was it?" prompt
-- Same as before, plus a review prompt for the client an hour after the session ends.
create or replace function public.schedule_reminders(p_booking uuid) returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  u uuid;
  tz text;
  day timestamp;
  t timestamptz;
  morning timestamptz;
  has_morning boolean;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.status <> 'confirmed' then return; end if;
  foreach u in array array[b.provider_id, b.client_id] loop
    tz := public.user_tz(u);
    day := date_trunc('day', b.starts_at at time zone tz);

    t := (day - interval '7 days' + interval '10 hours') at time zone tz;
    if t > now() then
      insert into public.booking_reminders (booking_id, user_id, kind, send_at) values (b.id, u, 'week', t) on conflict do nothing;
    end if;
    t := (day - interval '3 days' + interval '10 hours') at time zone tz;
    if t > now() then
      insert into public.booking_reminders (booking_id, user_id, kind, send_at) values (b.id, u, 'days', t) on conflict do nothing;
    end if;
    t := (day - interval '1 day' + interval '18 hours') at time zone tz;
    if t > now() and b.starts_at - t >= interval '12 hours' then
      insert into public.booking_reminders (booking_id, user_id, kind, send_at) values (b.id, u, 'tomorrow', t) on conflict do nothing;
    end if;
    morning := (day + interval '8 hours') at time zone tz;
    has_morning := morning > now() and b.starts_at - morning >= interval '2 hours 30 minutes';
    if has_morning then
      insert into public.booking_reminders (booking_id, user_id, kind, send_at) values (b.id, u, 'morning', morning) on conflict do nothing;
    end if;
    t := b.starts_at - interval '2 hours';
    if t > now() and not (has_morning and t - morning < interval '1 hour') then
      insert into public.booking_reminders (booking_id, user_id, kind, send_at) values (b.id, u, 'hours', t) on conflict do nothing;
    end if;
    t := b.starts_at - interval '30 minutes';
    if t > now() then
      insert into public.booking_reminders (booking_id, user_id, kind, send_at) values (b.id, u, 'soon', t) on conflict do nothing;
    end if;
  end loop;
  insert into public.booking_reminders (booking_id, user_id, kind, send_at)
  values (b.id, b.client_id, 'review', greatest(b.ends_at, now()) + interval '1 hour') on conflict do nothing;
end;
$$;

create or replace function public.send_due_reminders() returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  tz text;
  other uuid;
  who text;
  svc text;
  days int;
  title text;
  body text;
begin
  for r in
    select rm.id, rm.user_id, rm.kind, rm.send_at, b.id as booking_id, b.provider_id, b.client_id, b.service, b.starts_at, b.status
    from public.booking_reminders rm
    join public.bookings b on b.id = rm.booking_id
    where rm.sent_at is null and rm.send_at <= now()
    order by rm.send_at
    limit 200
    for update of rm skip locked
  loop
    update public.booking_reminders set sent_at = now() where id = r.id;
    continue when r.status <> 'confirmed';

    tz := public.user_tz(r.user_id);
    other := case when r.user_id = r.provider_id then r.client_id else r.provider_id end;
    who := public.display_name(other);
    svc := public.service_label(r.service);

    if r.kind = 'review' then
      -- Only if they haven't reviewed it already; a day late is still fine.
      continue when r.send_at < now() - interval '1 day'
        or exists (select 1 from public.reviews where booking_id = r.booking_id and reviewer_id = r.user_id);
      perform public.notify(r.user_id, 'review_request', 'How was your ' || svc || '?',
        'Rate your session with ' || who || '. It helps others find good people to work with.',
        '/bookings', other, r.booking_id, true, 'reminders');
      continue;
    end if;

    -- Skip sessions already started, and reminders more than an hour late.
    continue when r.starts_at <= now() or r.send_at < now() - interval '1 hour';
    days := (r.starts_at at time zone tz)::date - (now() at time zone tz)::date;

    if r.kind in ('week', 'days') then
      title := 'Your ' || svc || ' is in ' || days || ' days';
      body := 'With ' || who || ' · ' || public.fmt_when(r.starts_at, tz);
    elsif r.kind = 'tomorrow' then
      title := 'Your ' || svc || ' is tomorrow';
      body := 'With ' || who || ' at ' || public.fmt_time(r.starts_at, tz);
    elsif r.kind = 'morning' then
      title := 'Today: your ' || svc || ' at ' || public.fmt_time(r.starts_at, tz);
      body := 'With ' || who || '. Have a great session!';
    elsif r.kind = 'hours' then
      title := 'Your ' || svc || ' starts in 2 hours';
      body := 'With ' || who || ' at ' || public.fmt_time(r.starts_at, tz);
    else
      title := 'Your ' || svc || ' starts in 30 minutes';
      body := 'With ' || who || ' at ' || public.fmt_time(r.starts_at, tz) || '. Time to head over!';
    end if;

    perform public.notify(r.user_id, 'reminder', title, body, '/bookings', other, r.booking_id, true, 'reminders');
  end loop;
end;
$$;

-- Bookings confirmed before this change get their review prompt too.
insert into public.booking_reminders (booking_id, user_id, kind, send_at)
select id, client_id, 'review', greatest(ends_at, now()) + interval '1 hour'
from public.bookings
where status = 'confirmed' and ends_at > now() - interval '7 days'
on conflict do nothing;
