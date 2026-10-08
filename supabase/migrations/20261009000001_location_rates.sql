-- Map privacy and per-role rates.
-- exact_location: false (the default) means lng/lat are just the city centre, and the pin
-- sits over the city's name. People opt in to showing a precise spot. Studios with an
-- address are always shown at that address.
-- role_rates: a rate for each extra role ({"engineer": "Mix $120 / song"}); `rate` stays
-- the main role's rate.
alter table public.profiles
  add column exact_location boolean not null default false,
  add column role_rates jsonb not null default '{}'
    check (jsonb_typeof(role_rates) = 'object' and pg_column_size(role_rates) <= 2000);
