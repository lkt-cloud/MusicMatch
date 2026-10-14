-- Booking times: people post the time frames they're open for bookings, everyone can see them
-- on their profile, and they can send a few of them in a message.

create table public.booking_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 80),
  booked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint slot_order check (ends_at > starts_at),
  constraint slot_length check (ends_at - starts_at <= interval '24 hours')
);
create index booking_slots_owner_idx on public.booking_slots (owner_id, starts_at);

alter table public.booking_slots enable row level security;
create policy "Booking times are visible to everyone" on public.booking_slots for select using (true);
create policy "People add their own booking times" on public.booking_slots for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "People change their own booking times" on public.booking_slots for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "People delete their own booking times" on public.booking_slots for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Booking times sent in a message (a copy, so the message still reads right if the time is later changed).
alter table public.messages add column slots jsonb not null default '[]'
  check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) <= 20);
