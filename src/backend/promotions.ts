import { useMemo } from 'react';
import { useStore } from '../store';

/** At most this many promoted items sit at the top of a feed or list. */
export const MAX_PROMOTED = 2;

/** Quick lookups over the promotions running right now. */
export function usePromotionFlags() {
  const { promoted } = useStore();
  return useMemo(() => {
    const boosted = new Set(promoted.filter((p) => p.type === 'boost_post').map((p) => p.postId));
    const featured = new Set(promoted.filter((p) => p.type === 'featured_profile').map((p) => p.userId));
    const verified = new Set(promoted.filter((p) => p.type === 'studio_listing').map((p) => p.userId));
    return {
      isBoosted: (postId: string) => boosted.has(postId),
      isFeatured: (userId: string) => featured.has(userId),
      isVerifiedStudio: (userId: string) => verified.has(userId),
    };
  }, [promoted]);
}

/** Moves up to MAX_PROMOTED promoted items to the front; returns them and the rest separately. */
export function splitPromoted<T>(items: T[], isPromoted: (item: T) => boolean) {
  const top = items.filter(isPromoted).slice(0, MAX_PROMOTED);
  return { top, rest: items.filter((i) => !top.includes(i)) };
}
