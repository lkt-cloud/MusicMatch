-- Where a session happens, and "Add to calendar".
--
--  * Each booking has a place. A studio's own address is used automatically; otherwise the
--    client can suggest one when booking, and either person can set or change it later (the
--    other is told). Confirmations and reminders mention it.
--  * calendar_token lets the `calendar` Edge Function hand out a calendar file for the booking
--    (to Apple Calendar, Outlook…) without signing in; only the two people can see the token.

alter table public.bookings
  add column place text not null default '' check (char_length(place) <= 200),
  add column place_lng double precision check (place_lng between -180 and 180),
  add column place_lat double precision check (place_lat between -90 and 90),
  add column calendar_token uuid not null default gen_random_uuid();

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message', 'booking_request', 'booking_confirmed', 'booking_declined', 'booking_cancelled', 'booking_updated',
                  'reminder', 'review_request', 'review', 'report', 'report_update'));

-- " · at <place>" for notification text, or nothing when there's no place yet.
create function public.at_place(p text) returns text language sql immutable set search_path = '' as $$
  select case when coalesce(p, '') = '' then '' else ' · ' || p end;
$$;

-- ---------------------------------------------------------------- requesting, with a place
drop function public.request_booking(uuid, text, text);
create function public.request_booking(p_slot uuid, p_service text, p_note text default '', p_place text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  s public.booking_slots;
  provider public.profiles;
  existing uuid;
  new_id uuid;
  is_studio boolean;
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

  -- Studios host sessions at their own address.
  select * into provider from public.profiles where id = s.owner_id;
  is_studio := (provider.role = 'studio' or 'studio' = any (provider.also_roles)) and coalesce(provider.address, '') <> '';

  insert into public.bookings (provider_id, client_id, slot_id, service, starts_at, ends_at, note, place, place_lng, place_lat)
  values (
    s.owner_id, me, s.id, p_service, s.starts_at, s.ends_at, left(coalesce(p_note, ''), 300),
    case when is_studio then provider.address else left(trim(coalesce(p_place, '')), 200) end,
    case when is_studio then provider.lng end,
    case when is_studio then provider.lat end
  )
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.request_booking(uuid, text, text, text) from public, anon;
grant execute on function public.request_booking(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------- changing the place
create function public.set_booking_place(p_booking uuid, p_place text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  b public.bookings;
  other uuid;
  v_place text := left(trim(coalesce(p_place, '')), 200);
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or me not in (b.provider_id, b.client_id) then raise exception 'Booking not found'; end if;
  if b.status not in ('pending', 'confirmed') or b.ends_at <= now() then raise exception 'This booking can’t be changed any more.'; end if;
  if v_place = b.place then return; end if;

  -- A typed place has no map point; directions search for the text instead.
  update public.bookings set place = v_place, place_lng = null, place_lat = null, updated_at = now() where id = b.id;
  other := case when me = b.provider_id then b.client_id else b.provider_id end;
  perform public.notify(other, 'booking_updated', 'Session place updated',
    public.display_name(me) || case when v_place = '' then ' removed the place for your ' else ' set the place for your ' end
      || public.service_label(b.service) || ' on ' || public.fmt_when(b.starts_at, public.user_tz(other))
      || case when v_place = '' then '.' else ': ' || v_place end,
    '/bookings', me, b.id, true, 'bookings');
end;
$$;
revoke execute on function public.set_booking_place(uuid, text) from public, anon;
grant execute on function public.set_booking_place(uuid, text) to authenticated;

-- ---------------------------------------------------------------- booking news, with the place
create or replace function public.on_booking_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  svc text := public.service_label(new.service);
  other uuid;
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.provider_id, 'booking_request', 'New booking request',
      public.display_name(new.client_id) || ' wants to book a ' || svc || ' · ' || public.fmt_when(new.starts_at, public.user_tz(new.provider_id))
        || public.at_place(new.place),
      '/bookings', new.client_id, new.id, true, 'bookings');
  elsif new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.notify(new.client_id, 'booking_confirmed', 'Booking confirmed',
        public.display_name(new.provider_id) || ' confirmed your ' || svc || ' on ' || public.fmt_when(new.starts_at, public.user_tz(new.client_id))
          || public.at_place(new.place),
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

-- ---------------------------------------------------------------- reminders, with the place
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
    select rm.id, rm.user_id, rm.kind, rm.send_at, b.id as booking_id, b.provider_id, b.client_id, b.service, b.starts_at, b.status, b.place
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
      continue when r.send_at < now() - interval '1 day'
        or exists (select 1 from public.reviews where booking_id = r.booking_id and reviewer_id = r.user_id);
      perform public.notify(r.user_id, 'review_request', 'How was your ' || svc || '?',
        'Rate your session with ' || who || '. It helps others find good people to work with.',
        '/bookings', other, r.booking_id, true, 'reminders');
      continue;
    end if;

    continue when r.starts_at <= now() or r.send_at < now() - interval '1 hour';
    days := (r.starts_at at time zone tz)::date - (now() at time zone tz)::date;

    if r.kind in ('week', 'days') then
      title := 'Your ' || svc || ' is in ' || days || ' days';
      body := 'With ' || who || ' · ' || public.fmt_when(r.starts_at, tz) || public.at_place(r.place);
    elsif r.kind = 'tomorrow' then
      title := 'Your ' || svc || ' is tomorrow';
      body := 'With ' || who || ' at ' || public.fmt_time(r.starts_at, tz) || public.at_place(r.place);
    elsif r.kind = 'morning' then
      title := 'Today: your ' || svc || ' at ' || public.fmt_time(r.starts_at, tz);
      body := 'With ' || who || public.at_place(r.place) || '. Have a great session!';
    elsif r.kind = 'hours' then
      title := 'Your ' || svc || ' starts in 2 hours';
      body := 'With ' || who || ' at ' || public.fmt_time(r.starts_at, tz) || public.at_place(r.place);
    else
      title := 'Your ' || svc || ' starts in 30 minutes';
      body := 'With ' || who || ' at ' || public.fmt_time(r.starts_at, tz) || public.at_place(r.place) || '. Time to head over!';
    end if;

    perform public.notify(r.user_id, 'reminder', title, body, '/bookings', other, r.booking_id, true, 'reminders');
  end loop;
end;
$$;
