-- Bookings, notifications and reminders.
--
--  * bookings:              a client asks for one of a provider's booking times; the provider
--                           accepts or declines; either can cancel. Changes go through the
--                           functions at the bottom, so the rules can't be skipped.
--  * notifications:         everything we tell people about. Booking news and reminders show in
--                           the Bookings tab; messages only go out as push notifications.
--  * booking_reminders:     when to remind each person, worked out in their own time zone.
--  * push_subscriptions:    the phones and browsers to send push notifications to.
--  * notification_settings: what each person wants to hear about, and their time zone.
--
-- Push notifications are sent by the `push` Edge Function. New notifications call it straight
-- away (pg_net); a job every minute (pg_cron) sends due reminders and retries anything missed.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------- settings
create table public.notification_settings (
  user_id uuid primary key references public.profiles on delete cascade,
  timezone text not null default 'UTC',
  messages boolean not null default true,
  bookings boolean not null default true,
  reminders boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
create policy "People see their own notification settings" on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "People create their own notification settings" on public.notification_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "People change their own notification settings" on public.notification_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- An unknown time zone would break the reminder maths, so it falls back to UTC.
create function public.check_timezone() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    new.timezone := 'UTC';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger notification_settings_tz before insert or update on public.notification_settings
  for each row execute function public.check_timezone();

create function public.user_tz(u uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select timezone from public.notification_settings where user_id = u), 'UTC');
$$;

-- ---------------------------------------------------------------- push subscriptions
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('web', 'expo')),
  -- Web: the browser's push endpoint. App: the Expo push token.
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  keys jsonb,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "People see their own devices" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Saving goes through these so a phone that changes hands moves to the new account.
create function public.save_push_subscription(p_kind text, p_endpoint text, p_keys jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, kind, endpoint, keys) values ((select auth.uid()), p_kind, p_endpoint, p_keys);
end;
$$;
create function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;
revoke execute on function public.save_push_subscription(text, text, jsonb), public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, jsonb), public.remove_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------- bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles on delete cascade,
  client_id uuid not null references public.profiles on delete cascade,
  slot_id uuid references public.booking_slots on delete set null,
  service text not null check (service in ('studio_session', 'music_video', 'production', 'mixing', 'recording', 'performance', 'session')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  cancelled_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_parties check (provider_id <> client_id),
  constraint booking_order check (ends_at > starts_at)
);
create index bookings_provider_idx on public.bookings (provider_id, starts_at);
create index bookings_client_idx on public.bookings (client_id, starts_at);
create index bookings_slot_idx on public.bookings (slot_id);
alter table public.bookings enable row level security;
create policy "Both people can see their bookings" on public.bookings for select to authenticated
  using ((select auth.uid()) in (provider_id, client_id));

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('message', 'booking_request', 'booking_confirmed', 'booking_declined', 'booking_cancelled', 'reminder')),
  title text not null,
  body text not null default '',
  url text not null default '/',
  actor_id uuid references public.profiles on delete set null,
  booking_id uuid references public.bookings on delete cascade,
  -- false for messages: they're in the Messages tab already, so they only go out as a push.
  inbox boolean not null default true,
  push_wanted boolean not null default true,
  pushed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unpushed_idx on public.notifications (created_at) where push_wanted and pushed_at is null;
alter table public.notifications enable row level security;
create policy "People see their own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create function public.mark_notifications_read() returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and inbox and read_at is null;
$$;
revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

alter publication supabase_realtime add table public.notifications, public.bookings;

-- ---------------------------------------------------------------- reminders
create table public.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('week', 'days', 'tomorrow', 'morning', 'hours', 'soon')),
  send_at timestamptz not null,
  sent_at timestamptz,
  unique (booking_id, user_id, kind)
);
create index booking_reminders_due_idx on public.booking_reminders (send_at) where sent_at is null;
alter table public.booking_reminders enable row level security; -- server only: no policies

-- ---------------------------------------------------------------- helpers
create function public.service_label(s text) returns text language sql immutable set search_path = '' as $$
  select case s
    when 'studio_session' then 'studio session'
    when 'music_video' then 'music video shoot'
    when 'production' then 'production session'
    when 'mixing' then 'mixing session'
    when 'recording' then 'recording session'
    when 'performance' then 'performance'
    else 'session'
  end;
$$;

create function public.display_name(u uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select coalesce(nullif(name, ''), handle) from public.profiles where id = u), 'Someone');
$$;

-- "Thu, Oct 15 at 1:00 PM" and "1:00 PM", in someone's time zone.
create function public.fmt_when(t timestamptz, tz text) returns text language sql stable set search_path = '' as $$
  select to_char(t at time zone tz, 'Dy, Mon FMDD') || ' at ' || to_char(t at time zone tz, 'FMHH12:MI AM');
$$;
create function public.fmt_time(t timestamptz, tz text) returns text language sql stable set search_path = '' as $$
  select to_char(t at time zone tz, 'FMHH12:MI AM');
$$;

-- Adds a notification. Whether it's pushed follows the person's settings ("messages",
-- "bookings" or "reminders").
create function public.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text,
  p_actor uuid default null, p_booking uuid default null, p_inbox boolean default true, p_pref text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  wanted boolean := true;
begin
  select case p_pref when 'messages' then s.messages when 'bookings' then s.bookings when 'reminders' then s.reminders else true end
    into wanted from public.notification_settings s where s.user_id = p_user;
  insert into public.notifications (user_id, kind, title, body, url, actor_id, booking_id, inbox, push_wanted)
  values (p_user, p_kind, left(p_title, 120), left(p_body, 300), p_url, p_actor, p_booking, p_inbox, coalesce(wanted, true));
end;
$$;

-- Calls the push function. The shared secret lives in Vault (see the setup note at the end).
create function public.call_push(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_hook_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://emnxfjrfwbpzdbzmsjur.supabase.co/functions/v1/push',
    body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', secret)
  );
end;
$$;

create function public.on_notification_push() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.push_wanted then perform public.call_push(jsonb_build_object('id', new.id)); end if;
  return new;
end;
$$;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.on_notification_push();

-- ---------------------------------------------------------------- message notifications
create function public.on_message_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  preview text;
begin
  preview := case
    when new.text <> '' then left(new.text, 140)
    when jsonb_array_length(new.slots) > 0 then 'Sent you booking times'
    when jsonb_array_length(new.attachments) > 0 then
      case new.attachments -> 0 ->> 'kind' when 'image' then 'Sent a photo' when 'video' then 'Sent a video' when 'audio' then 'Sent audio' else 'Sent a file' end
    else 'New message'
  end;
  perform public.notify(new.recipient_id, 'message', public.display_name(new.sender_id), preview,
    '/messages/' || new.sender_id, new.sender_id, null, false, 'messages');
  return new;
end;
$$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.on_message_notify();

-- ---------------------------------------------------------------- reminders: when
-- For each person, in their own time zone: a week and 3 days before (10am), the evening before
-- (6pm), first thing on the day (8am), then 2 hours and 30 minutes before. Times already past,
-- or too close to another reminder, are skipped.
create function public.schedule_reminders(p_booking uuid) returns void language plpgsql security definer set search_path = '' as $$
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
end;
$$;

-- ---------------------------------------------------------------- reminders: sending
create function public.send_due_reminders() returns void language plpgsql security definer set search_path = '' as $$
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
    -- Skip cancelled bookings, sessions already started, and reminders more than an hour late.
    continue when r.status <> 'confirmed' or r.starts_at <= now() or r.send_at < now() - interval '1 hour';

    tz := public.user_tz(r.user_id);
    other := case when r.user_id = r.provider_id then r.client_id else r.provider_id end;
    who := public.display_name(other);
    svc := public.service_label(r.service);
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

-- ---------------------------------------------------------------- booking news
create function public.on_booking_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  svc text := public.service_label(new.service);
  other uuid;
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.provider_id, 'booking_request', 'New booking request',
      public.display_name(new.client_id) || ' wants to book a ' || svc || ' · ' || public.fmt_when(new.starts_at, public.user_tz(new.provider_id)),
      '/bookings', new.client_id, new.id, true, 'bookings');
  elsif new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.notify(new.client_id, 'booking_confirmed', 'Booking confirmed',
        public.display_name(new.provider_id) || ' confirmed your ' || svc || ' on ' || public.fmt_when(new.starts_at, public.user_tz(new.client_id)),
        '/bookings', new.provider_id, new.id, true, 'bookings');
      perform public.schedule_reminders(new.id);
    elsif new.status = 'declined' then
      perform public.notify(new.client_id, 'booking_declined', 'Booking request declined',
        public.display_name(new.provider_id) || ' can’t do ' || public.fmt_when(new.starts_at, public.user_tz(new.client_id)) || '. Try another time.',
        '/bookings', new.provider_id, new.id, true, 'bookings');
    elsif new.status = 'cancelled' then
      other := case when new.cancelled_by = new.provider_id then new.client_id else new.provider_id end;
      perform public.notify(other, 'booking_cancelled', 'Booking cancelled',
        public.display_name(new.cancelled_by) || ' cancelled the ' || svc || ' on ' || public.fmt_when(new.starts_at, public.user_tz(other)),
        '/bookings', new.cancelled_by, new.id, true, 'bookings');
      delete from public.booking_reminders where booking_id = new.id and sent_at is null;
    end if;
  end if;
  return new;
end;
$$;
create trigger bookings_notify after insert or update on public.bookings
  for each row execute function public.on_booking_change();

-- ---------------------------------------------------------------- booking actions
-- A client asks for one of a provider's open booking times.
create function public.request_booking(p_slot uuid, p_service text, p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  s public.booking_slots;
  existing uuid;
  new_id uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into s from public.booking_slots where id = p_slot;
  if s.id is null then raise exception 'That time isn’t available any more.'; end if;
  if s.owner_id = me then raise exception 'That’s your own booking time.'; end if;
  if s.booked then raise exception 'That time has already been booked.'; end if;
  if s.starts_at <= now() then raise exception 'That time has already passed.'; end if;
  if public.is_blocked_between(me, s.owner_id) then raise exception 'You can’t book this person.'; end if;

  select id into existing from public.bookings
    where slot_id = p_slot and client_id = me and status in ('pending', 'confirmed');
  if existing is not null then return existing; end if;

  insert into public.bookings (provider_id, client_id, slot_id, service, starts_at, ends_at, note)
  values (s.owner_id, me, s.id, p_service, s.starts_at, s.ends_at, left(coalesce(p_note, ''), 300))
  returning id into new_id;
  return new_id;
end;
$$;

-- The provider accepts or declines a request. Accepting books the time and declines any
-- other requests for it.
create function public.respond_booking(p_booking uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.provider_id <> me then raise exception 'Booking not found'; end if;
  if b.status <> 'pending' then raise exception 'This request has already been answered.'; end if;
  if p_accept and b.starts_at <= now() then raise exception 'That time has already passed.'; end if;

  update public.bookings set status = case when p_accept then 'confirmed' else 'declined' end, updated_at = now()
    where id = b.id;
  if p_accept and b.slot_id is not null then
    update public.booking_slots set booked = true where id = b.slot_id;
    update public.bookings set status = 'declined', updated_at = now()
      where slot_id = b.slot_id and id <> b.id and status = 'pending';
  end if;
end;
$$;

-- Either person cancels (a request, or a confirmed booking that hasn't started).
create function public.cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or me not in (b.provider_id, b.client_id) then raise exception 'Booking not found'; end if;
  if b.status not in ('pending', 'confirmed') then raise exception 'This booking is already closed.'; end if;
  if b.status = 'confirmed' and b.starts_at <= now() then raise exception 'This session has already started.'; end if;

  update public.bookings set status = 'cancelled', cancelled_by = me, updated_at = now() where id = b.id;
  if b.status = 'confirmed' and b.slot_id is not null then
    update public.booking_slots set booked = false where id = b.slot_id;
  end if;
end;
$$;

revoke execute on function public.request_booking(uuid, text, text), public.respond_booking(uuid, boolean), public.cancel_booking(uuid) from public, anon;
grant execute on function public.request_booking(uuid, text, text), public.respond_booking(uuid, boolean), public.cancel_booking(uuid) to authenticated;

-- Internal helpers aren't callable from the app.
revoke execute on function public.notify(uuid, text, text, text, text, uuid, uuid, boolean, text), public.call_push(jsonb),
  public.schedule_reminders(uuid), public.send_due_reminders(), public.user_tz(uuid), public.display_name(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- every minute
-- Send due reminders, retry pushes that didn't go out, and tidy up old notifications.
select cron.schedule('music-match-notifications', '* * * * *', $job$
  select public.send_due_reminders();
  select public.call_push('{}'::jsonb)
    where exists (select 1 from public.notifications where push_wanted and pushed_at is null and created_at < now() - interval '1 minute' and created_at > now() - interval '1 hour');
  delete from public.notifications where (not inbox and created_at < now() - interval '7 days') or created_at < now() - interval '90 days';
$job$);
