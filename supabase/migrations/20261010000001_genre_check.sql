-- Genres are ids from the app's catalogue (src/data/genres.ts), e.g. 'rap', 'afrobeats'.
-- The app cleans them before saving; this stops anything else (typos, very long lists,
-- free text sent straight to the API) from being stored. A pattern rather than a fixed
-- list, so adding a genre to the app doesn't need a database change.
alter table public.profiles
  add constraint genres_are_ids check (
    cardinality(genres) <= 30
    and (cardinality(genres) = 0 or array_to_string(genres, ',') ~ '^[a-z0-9]{2,20}(,[a-z0-9]{2,20})*$')
  );
