-- Community posts get a fourth topic, "Random", for off-topic posts.
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind in ('collab', 'promo', 'question', 'random'));
