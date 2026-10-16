import type { PromotionType } from '../backend/api';
import { useStore } from '../store';
import { t } from '../i18n';

// Shown in the app; the amounts actually charged live in Stripe (see scripts/stripe-setup.mjs).
// People whose profile is in Japan pay in yen, everyone else in US dollars. The checkout
// function (supabase/functions/create-checkout) picks the currency with the same rule.
/** Shown next to introductory prices (translated where it's shown). */
export const LAUNCH_LABEL = 'Launch pricing';

export type Currency = 'usd' | 'jpy';
export const currencyFor = (country: string): Currency => (country === 'JP' ? 'jpy' : 'usd');

const AMOUNTS: Record<PromotionType, Record<Currency, number>> = {
  boost_post: { usd: 5, jpy: 750 },
  featured_profile: { usd: 7, jpy: 1000 },
  studio_listing: { usd: 15, jpy: 2250 },
};

const DETAILS: Record<PromotionType, { name: string; per: string; blurb: string }> = {
  boost_post: {
    get name() { return t('Boost a post'); },
    get per() { return t('one-time · 7 days'); },
    get blurb() { return t('Your post shows at the top of Community, marked Promoted, for 7 days.'); },
  },
  featured_profile: {
    get name() { return t('Featured profile'); },
    get per() { return t('per month'); },
    get blurb() { return t('You show first when people in your city search the map.'); },
  },
  studio_listing: {
    get name() { return t('Studio listing'); },
    get per() { return t('per month'); },
    get blurb() { return t('A highlighted listing with a Verified Studio badge everywhere you appear.'); },
  },
};

const formatPrice = (amount: number, currency: Currency) =>
  currency === 'jpy' ? `¥${amount.toLocaleString('en-US')}` : `$${amount}`;

export type Pricing = Record<PromotionType, { name: string; price: string; per: string; blurb: string }>;

export function pricingFor(country: string): Pricing {
  const currency = currencyFor(country);
  return Object.fromEntries(
    (Object.keys(DETAILS) as PromotionType[]).map((type) => [type, { ...DETAILS[type], price: formatPrice(AMOUNTS[type][currency], currency) }]),
  ) as Pricing;
}

/** Prices in the signed-in person's currency. */
export function usePricing(): Pricing {
  return pricingFor(useStore().me.country);
}
