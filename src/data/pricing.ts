import type { PromotionType } from '../backend/api';
import { useStore } from '../store';

// Shown in the app; the amounts actually charged live in Stripe (see scripts/stripe-setup.mjs).
// People whose profile is in Japan pay in yen, everyone else in US dollars. The checkout
// function (supabase/functions/create-checkout) picks the currency with the same rule.
export const LAUNCH_LABEL = 'Launch pricing';

export type Currency = 'usd' | 'jpy';
export const currencyFor = (country: string): Currency => (country === 'JP' ? 'jpy' : 'usd');

const AMOUNTS: Record<PromotionType, Record<Currency, number>> = {
  boost_post: { usd: 5, jpy: 750 },
  featured_profile: { usd: 7, jpy: 1000 },
  studio_listing: { usd: 20, jpy: 3000 },
};

const DETAILS: Record<PromotionType, { name: string; per: string; blurb: string }> = {
  boost_post: {
    name: 'Boost a post',
    per: 'one-time · 7 days',
    blurb: 'Your post shows at the top of Community, marked Promoted, for 7 days.',
  },
  featured_profile: {
    name: 'Featured profile',
    per: 'per month',
    blurb: 'You show first when people in your city search the map.',
  },
  studio_listing: {
    name: 'Studio listing',
    per: 'per month',
    blurb: 'A highlighted listing with a Verified Studio badge everywhere you appear.',
  },
};

const formatPrice = (amount: number, currency: Currency) =>
  currency === 'jpy' ? `¥${amount.toLocaleString('en-US')}` : `$${amount}`;

export type Pricing = Record<PromotionType, { name: string; price: string; per: string; blurb: string }>;

export function pricingFor(country: string): Pricing {
  const currency = currencyFor(country);
  return Object.fromEntries(
    (Object.keys(DETAILS) as PromotionType[]).map((t) => [t, { ...DETAILS[t], price: formatPrice(AMOUNTS[t][currency], currency) }]),
  ) as Pricing;
}

/** Prices in the signed-in person's currency. */
export function usePricing(): Pricing {
  return pricingFor(useStore().me.country);
}
