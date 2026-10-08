import Stripe from 'npm:stripe@17.7.0';

// Pinned API version so the shapes this code reads never change underneath it.
export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2025-02-24.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

export const cryptoProvider = Stripe.createSubtleCryptoProvider();

export type PromotionType = 'boost_post' | 'featured_profile' | 'studio_listing';

/** What each promotion costs. Prices live in Stripe and are found by lookup key. */
export const PRODUCTS: Record<PromotionType, { lookupKey: string; mode: 'payment' | 'subscription' }> = {
  boost_post: { lookupKey: 'mm_boost_post_launch', mode: 'payment' },
  featured_profile: { lookupKey: 'mm_featured_profile_launch', mode: 'subscription' },
  studio_listing: { lookupKey: 'mm_studio_listing_launch', mode: 'subscription' },
};

export const BOOST_DAYS = 7;
/** Extra time after a billing period ends, so a renewal webhook arriving a little late doesn't switch a subscription off. */
export const RENEWAL_GRACE_MS = 24 * 60 * 60 * 1000;

/** End of the subscription's current billing period (field moved between API versions). */
export function periodEnd(sub: Stripe.Subscription): Date {
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const fromItem = (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  return new Date(((legacy ?? fromItem ?? Math.floor(Date.now() / 1000)) * 1000) + RENEWAL_GRACE_MS);
}
