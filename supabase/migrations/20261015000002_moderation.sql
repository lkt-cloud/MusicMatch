-- Moderation: admins review reports, remove content and suspend accounts.
--
--  * admins:       who can moderate. Add yourself once (see the note at the end).
--  * reports:      now have a status (open / resolved / dismissed) and the action taken.
--  * suspensions:  a suspended account can't post, comment, like, message, add booking times,
--                  book or review, and is hidden from everyone else. Until a date, or for good.
-- Admins get a notification for every new report (Apple expects action within 24 hours), and
-- the person who reported something hears back when action is taken.

-- ---------------------------------------------------------------- admins
create table public.admins (
  user_id uuid primary key references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security; -- no policies: only via is_admin()

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
-- Guests need it too: the visibility rules below call it for everyone (it's false for them).
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------- report status
alter table public.reports
  add column status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  add column action text,
  add column resolved_by uuid references public.profiles on delete set null,
  add column resolved_at timestamptz;
create index reports_open_idx on public.reports (created_at desc) where status = 'open';
create policy "Admins can read reports" on public.reports for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- suspensions
create table public.suspensions (
  user_id uuid primary key references public.profiles on delete cascade,
  until timestamptz, -- null: for good
  reason text not null default '' check (char_length(reason) <= 300),
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
alter table public.suspensions enable row level security; -- no policies: only via the functions below

create function public.is_suspended(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.suspensions where user_id = u and (until is null or until > now()));
$$;
grant execute on function public.is_suspended(uuid) to anon, authenticated;

-- Suspended accounts are hidden from everyone but themselves (and admins).
drop policy "Profiles are visible to everyone" on public.profiles;
create policy "Profiles are visible to everyone" on public.profiles for select
  using (not public.is_suspended(id) or id = (select auth.uid()) or public.is_admin());
drop policy "Posts are visible to everyone" on public.posts;
create policy "Posts are visible to everyone" on public.posts for select
  using (not public.is_suspended(author_id) or author_id = (select auth.uid()) or public.is_admin());
drop policy "Comments are visible to everyone" on public.comments;
create policy "Comments are visible to everyone" on public.comments for select
  using (not public.is_suspended(author_id) or author_id = (select auth.uid()) or public.is_admin());

-- …and can't add anything new. One check, used on every table people write to.
create function public.forbid_suspended() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_suspended((to_jsonb(new) ->> tg_argv[0])::uuid) then
    raise exception 'Your account is suspended, so you can’t do that right now.';
  end if;
  return new;
end;
$$;
create trigger posts_not_suspended before insert on public.posts for each row execute function public.forbid_suspended('author_id');
create trigger comments_not_suspended before insert on public.comments for each row execute function public.forbid_suspended('author_id');
create trigger likes_not_suspended before insert on public.post_likes for each row execute function public.forbid_suspended('user_id');
create trigger messages_not_suspended before insert on public.messages for each row execute function public.forbid_suspended('sender_id');
create trigger slots_not_suspended before insert on public.booking_slots for each row execute function public.forbid_suspended('owner_id');
create trigger bookings_not_suspended before insert on public.bookings for each row execute function public.forbid_suspended('client_id');
create trigger reviews_not_suspended before insert on public.reviews for each row execute function public.forbid_suspended('reviewer_id');

-- What a suspended person sees about their own account.
create function public.my_suspension() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('until', until, 'reason', reason)
  from public.suspensions where user_id = (select auth.uid()) and (until is null or until > now());
$$;
revoke execute on function public.my_suspension() from public, anon;
grant execute on function public.my_suspension() to authenticated;

-- ---------------------------------------------------------------- notifications
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message', 'booking_request', 'booking_confirmed', 'booking_declined', 'booking_cancelled', 'reminder',
                  'review_request', 'review', 'report', 'report_update'));

create function public.reason_label(r text) returns text language sql immutable set search_path = '' as $$
  select case r
    when 'spam' then 'Spam or scam'
    when 'harassment' then 'Harassment or hate'
    when 'sexual' then 'Sexual or graphic content'
    when 'violence' then 'Violence or dangerous behaviour'
    when 'impersonation' then 'Pretending to be someone else'
    when 'copyright' then 'Stolen work'
    else 'Something else'
  end;
$$;

-- Every admin hears about a new report straight away.
create function public.on_report_created() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a uuid;
begin
  for a in select user_id from public.admins loop
    perform public.notify(a, 'report', 'New report: ' || public.reason_label(new.reason),
      'A ' || new.target_type || ' by ' || public.display_name(new.reported_user_id)
        || case when new.details <> '' then ' · “' || left(new.details, 100) || '”' else '' end,
      '/admin', new.reporter_id, null, true, null);
  end loop;
  return new;
end;
$$;
create trigger reports_notify_admins after insert on public.reports
  for each row execute function public.on_report_created();

-- Closes the open reports about something, and tells the people who reported it.
create function public.close_reports(p_ids uuid[], p_status text, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    update public.reports set status = p_status, action = p_action, resolved_by = (select auth.uid()), resolved_at = now()
    where id = any (p_ids) and status = 'open'
    returning reporter_id, target_type
  loop
    if p_status = 'resolved' then
      perform public.notify(r.reporter_id, 'report_update', 'Thanks for your report',
        'We looked at the ' || r.target_type || ' you reported and took action.', '/', null, null, true, null);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- admin actions
create function public.require_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can do that.'; end if;
end;
$$;

-- Reports with what was reported, so it can be judged without leaving the page.
create function public.admin_reports(p_open boolean default true) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(x order by created_at desc)
    from (
      select r.created_at, jsonb_build_object(
        'id', r.id, 'reporter_id', r.reporter_id, 'reported_user_id', r.reported_user_id,
        'target_type', r.target_type, 'target_id', r.target_id, 'reason', r.reason, 'details', r.details,
        'status', r.status, 'action', r.action, 'created_at', r.created_at, 'resolved_at', r.resolved_at,
        'times_reported', (select count(*) from public.reports r2 where r2.target_type = r.target_type and r2.target_id = r.target_id),
        'suspended', public.is_suspended(r.reported_user_id),
        'content', case r.target_type
          when 'post' then (select jsonb_build_object('text', p.text, 'files', jsonb_array_length(p.attachments)) from public.posts p where p.id::text = r.target_id)
          when 'comment' then (select jsonb_build_object('text', c.text) from public.comments c where c.id::text = r.target_id)
          when 'message' then (select jsonb_build_object('text', m.text, 'files', jsonb_array_length(m.attachments)) from public.messages m where m.id::text = r.target_id)
          when 'review' then (select jsonb_build_object('text', v.comment, 'rating', v.rating) from public.reviews v where v.id::text = r.target_id)
          when 'profile' then (select jsonb_build_object('text', coalesce(nullif(p.name, ''), p.handle) || case when p.bio <> '' then ' · ' || p.bio else '' end)
                               from public.profiles p where p.id::text = r.target_id)
        end
      ) as x
      from public.reports r
      where (p_open and r.status = 'open') or (not p_open and r.status <> 'open')
      order by r.created_at desc
      limit 200
    ) s
  ), '[]'::jsonb);
end;
$$;

-- Deletes a reported post, comment, message or review, and closes its reports.
create function public.admin_remove(p_report uuid) returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.reports;
begin
  perform public.require_admin();
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'Report not found'; end if;
  case r.target_type
    when 'post' then delete from public.posts where id::text = r.target_id;
    when 'comment' then delete from public.comments where id::text = r.target_id;
    when 'message' then delete from public.messages where id::text = r.target_id;
    when 'review' then delete from public.reviews where id::text = r.target_id;
    else raise exception 'Profiles can’t be removed this way. Suspend the account instead.';
  end case;
  perform public.close_reports(
    array(select id from public.reports where target_type = r.target_type and target_id = r.target_id and status = 'open'),
    'resolved', 'Removed the ' || r.target_type);
end;
$$;

-- Suspends an account for some days (or for good when p_days is null) and closes reports about it.
create function public.admin_suspend(p_user uuid, p_days int, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if p_user = (select auth.uid()) then raise exception 'You can’t suspend yourself.'; end if;
  insert into public.suspensions (user_id, until, reason, created_by)
  values (p_user, case when p_days is null then null else now() + make_interval(days => p_days) end, left(coalesce(p_reason, ''), 300), (select auth.uid()))
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, created_by = excluded.created_by, created_at = now();
  -- Their open booking requests and upcoming bookings are cancelled, so nobody is left waiting.
  update public.bookings set status = 'cancelled', cancelled_by = p_user, updated_at = now()
  where p_user in (provider_id, client_id) and status in ('pending', 'confirmed') and starts_at > now();
  perform public.close_reports(
    array(select id from public.reports where reported_user_id = p_user and status = 'open'),
    'resolved', case when p_days is null then 'Suspended for good' else 'Suspended for ' || p_days || ' days' end);
end;
$$;

create function public.admin_unsuspend(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  delete from public.suspensions where user_id = p_user;
end;
$$;

-- Nothing wrong: closes the report without telling anyone.
create function public.admin_dismiss(p_report uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  perform public.close_reports(array[p_report], 'dismissed', 'No action');
end;
$$;

create function public.admin_suspensions() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', user_id, 'until', until, 'reason', reason, 'created_at', created_at) order by created_at desc)
    from public.suspensions where until is null or until > now()
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_reports(boolean), public.admin_remove(uuid), public.admin_suspend(uuid, int, text),
  public.admin_unsuspend(uuid), public.admin_dismiss(uuid), public.admin_suspensions() from public, anon;
grant execute on function public.admin_reports(boolean), public.admin_remove(uuid), public.admin_suspend(uuid, int, text),
  public.admin_unsuspend(uuid), public.admin_dismiss(uuid), public.admin_suspensions() to authenticated;
revoke execute on function public.close_reports(uuid[], text, text), public.require_admin() from public, anon, authenticated;

-- To make yourself an admin, run this once with the email you sign in with:
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
