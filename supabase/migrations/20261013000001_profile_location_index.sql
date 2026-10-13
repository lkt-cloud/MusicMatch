-- The app now loads profiles by map area (a lat/lng box) instead of all at once.
-- These indexes keep those lookups and the "recently active" list fast as the number of users grows.
create index if not exists profiles_lat_lng_idx on public.profiles (lat, lng) where city <> '';
create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc) where city <> '';
