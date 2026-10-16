-- Notifications in each person's language (English or Japanese).
-- The app saves your language next to your time zone (notification_settings.language), and
-- every notification and reminder is written in it. Dates are written the Japanese way in
-- Japanese ("10月15日(木) 13:00").

alter table public.notification_settings
  add column language text not null default 'en' check (language in ('en', 'ja'));

create function public.user_lang(u uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select language from public.notification_settings where user_id = u), 'en');
$$;

create function public.service_label_in(s text, lang text) returns text language sql immutable set search_path = '' as $$
  select case when lang = 'ja' then
    case s
      when 'studio_session' then 'スタジオセッション'
      when 'music_video' then 'MV撮影'
      when 'production' then '制作セッション'
      when 'mixing' then 'ミキシング'
      when 'recording' then 'レコーディング'
      when 'performance' then 'ライブ出演'
      else 'セッション'
    end
  else public.service_label(s) end;
$$;

-- "10月15日(木) 13:00" / "Thu, Oct 15 at 1:00 PM"
create function public.fmt_when_in(t timestamptz, tz text, lang text) returns text language sql stable set search_path = '' as $$
  select case when lang = 'ja' then
    to_char(t at time zone tz, 'FMMM月FMDD日') || '('
      || (array['日', '月', '火', '水', '木', '金', '土'])[extract(dow from t at time zone tz)::int + 1] || ') '
      || to_char(t at time zone tz, 'HH24:MI')
  else public.fmt_when(t, tz) end;
$$;

create function public.fmt_time_in(t timestamptz, tz text, lang text) returns text language sql stable set search_path = '' as $$
  select case when lang = 'ja' then to_char(t at time zone tz, 'HH24:MI') else public.fmt_time(t, tz) end;
$$;

-- "Kofi" / "Kofiさん"
create function public.name_in(u uuid, lang text) returns text language sql stable security definer set search_path = '' as $$
  select public.display_name(u) || case when lang = 'ja' then 'さん' else '' end;
$$;

revoke execute on function public.user_lang(uuid), public.name_in(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- messages
create or replace function public.on_message_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ja boolean := public.user_lang(new.recipient_id) = 'ja';
  preview text;
begin
  preview := case
    when new.text <> '' then left(new.text, 140)
    when jsonb_array_length(new.slots) > 0 then case when ja then '予約可能な時間が届きました' else 'Sent you booking times' end
    when jsonb_array_length(new.attachments) > 0 then
      case new.attachments -> 0 ->> 'kind'
        when 'image' then case when ja then '写真が届きました' else 'Sent a photo' end
        when 'video' then case when ja then '動画が届きました' else 'Sent a video' end
        when 'audio' then case when ja then '音声が届きました' else 'Sent audio' end
        else case when ja then 'ファイルが届きました' else 'Sent a file' end
      end
    else case when ja then '新しいメッセージ' else 'New message' end
  end;
  perform public.notify(new.recipient_id, 'message', public.display_name(new.sender_id), preview,
    '/messages/' || new.sender_id, new.sender_id, null, false, 'messages');
  return new;
end;
$$;

-- ---------------------------------------------------------------- booking news
create or replace function public.on_booking_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  other uuid;
  l text;
  tz text;
begin
  if tg_op = 'INSERT' then
    l := public.user_lang(new.provider_id);
    tz := public.user_tz(new.provider_id);
    perform public.notify(new.provider_id, 'booking_request',
      case when l = 'ja' then '新しい予約リクエスト' else 'New booking request' end,
      case when l = 'ja'
        then public.name_in(new.client_id, l) || 'が' || public.fmt_when_in(new.starts_at, tz, l) || 'の' || public.service_label_in(new.service, l) || 'を予約したいそうです'
        else public.display_name(new.client_id) || ' wants to book a ' || public.service_label(new.service) || ' · ' || public.fmt_when(new.starts_at, tz)
      end || public.at_place(new.place),
      '/bookings', new.client_id, new.id, true, 'bookings');
  elsif new.status is distinct from old.status then
    if new.status = 'confirmed' then
      l := public.user_lang(new.client_id);
      tz := public.user_tz(new.client_id);
      perform public.notify(new.client_id, 'booking_confirmed',
        case when l = 'ja' then '予約が確定しました' else 'Booking confirmed' end,
        case when l = 'ja'
          then public.name_in(new.provider_id, l) || 'が' || public.fmt_when_in(new.starts_at, tz, l) || 'の' || public.service_label_in(new.service, l) || 'を確定しました'
          else public.display_name(new.provider_id) || ' confirmed your ' || public.service_label(new.service) || ' on ' || public.fmt_when(new.starts_at, tz)
        end || public.at_place(new.place),
        '/bookings', new.provider_id, new.id, true, 'bookings');
      perform public.schedule_reminders(new.id);
    elsif new.status = 'declined' then
      l := public.user_lang(new.client_id);
      tz := public.user_tz(new.client_id);
      perform public.notify(new.client_id, 'booking_declined',
        case when l = 'ja' then '予約リクエストが辞退されました' else 'Booking request declined' end,
        case when l = 'ja'
          then public.name_in(new.provider_id, l) || 'は' || public.fmt_when_in(new.starts_at, tz, l) || 'は対応できないそうです。別の時間をお試しください。'
          else public.display_name(new.provider_id) || ' can’t do ' || public.fmt_when(new.starts_at, tz) || '. Try another time.'
        end,
        '/bookings', new.provider_id, new.id, true, 'bookings');
    elsif new.status = 'cancelled' then
      other := case when new.cancelled_by = new.provider_id then new.client_id else new.provider_id end;
      l := public.user_lang(other);
      tz := public.user_tz(other);
      perform public.notify(other, 'booking_cancelled',
        case when l = 'ja' then '予約がキャンセルされました' else 'Booking cancelled' end,
        case when l = 'ja'
          then public.name_in(new.cancelled_by, l) || 'が' || public.fmt_when_in(new.starts_at, tz, l) || 'の' || public.service_label_in(new.service, l) || 'をキャンセルしました'
          else public.display_name(new.cancelled_by) || ' cancelled the ' || public.service_label(new.service) || ' on ' || public.fmt_when(new.starts_at, tz)
        end,
        '/bookings', new.cancelled_by, new.id, true, 'bookings');
      delete from public.booking_reminders where booking_id = new.id and sent_at is null;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- changing the place
create or replace function public.set_booking_place(p_booking uuid, p_place text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  b public.bookings;
  other uuid;
  v_place text := left(trim(coalesce(p_place, '')), 200);
  l text;
  tz text;
  body text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or me not in (b.provider_id, b.client_id) then raise exception 'Booking not found'; end if;
  if b.status not in ('pending', 'confirmed') or b.ends_at <= now() then raise exception 'This booking can’t be changed any more.'; end if;
  if v_place = b.place then return; end if;

  update public.bookings set place = v_place, place_lng = null, place_lat = null, updated_at = now() where id = b.id;
  other := case when me = b.provider_id then b.client_id else b.provider_id end;
  l := public.user_lang(other);
  tz := public.user_tz(other);
  if l = 'ja' then
    body := public.name_in(me, l) || 'が' || public.fmt_when_in(b.starts_at, tz, l) || 'の' || public.service_label_in(b.service, l)
      || case when v_place = '' then 'の場所を削除しました。' else 'の場所を設定しました：' || v_place end;
  else
    body := public.display_name(me) || case when v_place = '' then ' removed the place for your ' else ' set the place for your ' end
      || public.service_label(b.service) || ' on ' || public.fmt_when(b.starts_at, tz)
      || case when v_place = '' then '.' else ': ' || v_place end;
  end if;
  perform public.notify(other, 'booking_updated', case when l = 'ja' then 'セッションの場所が更新されました' else 'Session place updated' end,
    body, '/bookings', me, b.id, true, 'bookings');
end;
$$;

-- ---------------------------------------------------------------- reminders
create or replace function public.send_due_reminders() returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  tz text;
  l text;
  other uuid;
  who text;
  svc text;
  days int;
  title text;
  body text;
  at_time text;
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
    l := public.user_lang(r.user_id);
    other := case when r.user_id = r.provider_id then r.client_id else r.provider_id end;
    who := public.name_in(other, l);
    svc := public.service_label_in(r.service, l);
    at_time := public.fmt_time_in(r.starts_at, tz, l);

    if r.kind = 'review' then
      continue when r.send_at < now() - interval '1 day'
        or exists (select 1 from public.reviews where booking_id = r.booking_id and reviewer_id = r.user_id);
      if l = 'ja' then
        title := svc || 'はどうでしたか？';
        body := who || 'とのセッションを評価しましょう。ほかの人が良い相手を見つける助けになります。';
      else
        title := 'How was your ' || svc || '?';
        body := 'Rate your session with ' || who || '. It helps others find good people to work with.';
      end if;
      perform public.notify(r.user_id, 'review_request', title, body, '/bookings', other, r.booking_id, true, 'reminders');
      continue;
    end if;

    continue when r.starts_at <= now() or r.send_at < now() - interval '1 hour';
    days := (r.starts_at at time zone tz)::date - (now() at time zone tz)::date;

    if l = 'ja' then
      if r.kind in ('week', 'days') then
        title := svc || 'まであと' || days || '日';
        body := who || 'と · ' || public.fmt_when_in(r.starts_at, tz, l) || public.at_place(r.place);
      elsif r.kind = 'tomorrow' then
        title := '明日は' || svc || 'です';
        body := who || 'と ' || at_time || 'から' || public.at_place(r.place);
      elsif r.kind = 'morning' then
        title := '今日は' || at_time || 'から' || svc || 'です';
        body := who || 'と' || public.at_place(r.place) || '。いいセッションを！';
      elsif r.kind = 'hours' then
        title := svc || 'まであと2時間';
        body := who || 'と ' || at_time || 'から' || public.at_place(r.place);
      else
        title := svc || 'まであと30分';
        body := who || 'と ' || at_time || 'から' || public.at_place(r.place) || '。そろそろ出発しましょう！';
      end if;
    else
      if r.kind in ('week', 'days') then
        title := 'Your ' || svc || ' is in ' || days || ' days';
        body := 'With ' || who || ' · ' || public.fmt_when(r.starts_at, tz) || public.at_place(r.place);
      elsif r.kind = 'tomorrow' then
        title := 'Your ' || svc || ' is tomorrow';
        body := 'With ' || who || ' at ' || at_time || public.at_place(r.place);
      elsif r.kind = 'morning' then
        title := 'Today: your ' || svc || ' at ' || at_time;
        body := 'With ' || who || public.at_place(r.place) || '. Have a great session!';
      elsif r.kind = 'hours' then
        title := 'Your ' || svc || ' starts in 2 hours';
        body := 'With ' || who || ' at ' || at_time || public.at_place(r.place);
      else
        title := 'Your ' || svc || ' starts in 30 minutes';
        body := 'With ' || who || ' at ' || at_time || public.at_place(r.place) || '. Time to head over!';
      end if;
    end if;

    perform public.notify(r.user_id, 'reminder', title, body, '/bookings', other, r.booking_id, true, 'reminders');
  end loop;
end;
$$;

-- ---------------------------------------------------------------- reviews
create or replace function public.submit_review(p_booking uuid, p_rating int, p_comment text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  b public.bookings;
  existed boolean;
  l text;
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
    l := public.user_lang(b.provider_id);
    perform public.notify(b.provider_id, 'review',
      case when l = 'ja' then public.name_in(me, l) || 'から星' || p_rating || 'つのレビューが届きました'
           else public.display_name(me) || ' left you a ' || p_rating || '-star review' end,
      coalesce(nullif(left(p_comment, 140), ''),
        case when l = 'ja' then public.service_label_in(b.service, l) || 'について。' else 'For your ' || public.service_label(b.service) || '.' end),
      '/me', me, b.id, true, 'bookings');
  end if;
end;
$$;

-- ---------------------------------------------------------------- moderation
create or replace function public.on_report_created() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a uuid;
  l text;
  thing text;
begin
  for a in select user_id from public.admins loop
    l := public.user_lang(a);
    if l = 'ja' then
      thing := case new.target_type when 'post' then '投稿' when 'comment' then 'コメント' when 'profile' then 'プロフィール'
                 when 'message' then 'メッセージ' when 'review' then 'レビュー' else new.target_type end;
      perform public.notify(a, 'report',
        '新しい報告：' || case new.reason
          when 'spam' then 'スパム・詐欺' when 'harassment' then '嫌がらせ・ヘイト' when 'sexual' then '性的・過激な内容'
          when 'violence' then '暴力・危険な行為' when 'impersonation' then 'なりすまし' when 'copyright' then '作品の無断使用' else 'その他' end,
        public.name_in(new.reported_user_id, l) || 'の' || thing
          || case when new.details <> '' then ' · 「' || left(new.details, 100) || '」' else '' end,
        '/admin', new.reporter_id, null, true, null);
    else
      perform public.notify(a, 'report', 'New report: ' || public.reason_label(new.reason),
        'A ' || new.target_type || ' by ' || public.display_name(new.reported_user_id)
          || case when new.details <> '' then ' · “' || left(new.details, 100) || '”' else '' end,
        '/admin', new.reporter_id, null, true, null);
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.close_reports(p_ids uuid[], p_status text, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  l text;
begin
  for r in
    update public.reports set status = p_status, action = p_action, resolved_by = (select auth.uid()), resolved_at = now()
    where id = any (p_ids) and status = 'open'
    returning reporter_id, target_type
  loop
    if p_status = 'resolved' then
      l := public.user_lang(r.reporter_id);
      if l = 'ja' then
        perform public.notify(r.reporter_id, 'report_update', 'ご報告ありがとうございます',
          '報告いただいた' || case r.target_type when 'post' then '投稿' when 'comment' then 'コメント' when 'profile' then 'プロフィール'
            when 'message' then 'メッセージ' when 'review' then 'レビュー' else r.target_type end || 'を確認し、対応しました。',
          '/', null, null, true, null);
      else
        perform public.notify(r.reporter_id, 'report_update', 'Thanks for your report',
          'We looked at the ' || r.target_type || ' you reported and took action.', '/', null, null, true, null);
      end if;
    end if;
  end loop;
end;
$$;
