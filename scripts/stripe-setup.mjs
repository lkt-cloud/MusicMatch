// Creates Music Match's three promotion products in your Stripe account (safe to re-run).
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//
// Prices are found by "lookup key", so nothing needs to be copied into the code afterwards.
// To change a price, edit the amounts below and run it again: Stripe prices can't be edited,
// so a new price takes over the lookup key and the old one is archived. People already
// subscribed keep paying what they signed up for.
// Each price is in US dollars with a yen option: people in Japan pay in yen, everyone else
// in dollars. Keep the amounts in step with src/data/pricing.ts.

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Set STRIPE_SECRET_KEY first (your sk_test_... key from the Stripe dashboard).');
  process.exit(1);
}
if (key.startsWith('sk_live_')) {
  console.error('That is a LIVE key. Use your test key (sk_test_...) until everything is tested.');
  process.exit(1);
}

const PRODUCTS = [
  {
    lookupKey: 'mm_boost_post_launch',
    name: 'Boosted post (7 days)',
    description: 'Your post shows at the top of the Community feed for 7 days. Launch pricing.',
    amount: 500,
    yen: 750,
  },
  {
    lookupKey: 'mm_featured_profile_launch',
    name: 'Featured profile',
    description: 'Your profile shows first in search results in your city. Launch pricing.',
    amount: 700,
    yen: 1000,
    interval: 'month',
  },
  {
    lookupKey: 'mm_studio_listing_launch',
    name: 'Studio listing',
    description: 'A highlighted listing with a Verified Studio badge. Launch pricing.',
    amount: 1500,
    yen: 2250,
    interval: 'month',
  },
];

async function stripe(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? res.statusText);
  return body;
}

const money = (p, per = p.interval ? '/' + p.interval : '') =>
  `$${(p.amount / 100).toFixed(2)}${per} or ¥${p.yen.toLocaleString('en-US')}${per}`;

const createPrice = (p, product, transfer = false) =>
  stripe('prices', {
    product,
    currency: 'usd',
    unit_amount: String(p.amount),
    'currency_options[jpy][unit_amount]': String(p.yen), // yen has no cents
    lookup_key: p.lookupKey,
    ...(transfer ? { transfer_lookup_key: 'true' } : {}),
    ...(p.interval ? { 'recurring[interval]': p.interval } : {}),
  });

for (const p of PRODUCTS) {
  const existing = await stripe(`prices?active=true&lookup_keys[]=${p.lookupKey}&expand[]=data.currency_options`);
  const old = existing.data[0];
  if (!old) {
    const product = await stripe('products', { name: p.name, description: p.description, 'metadata[app]': 'music-match' });
    const price = await createPrice(p, product.id);
    console.log(`+ Created ${p.name}: ${money(p)} (${price.id})`);
    continue;
  }
  if (old.unit_amount !== p.amount) {
    // New amount: a fresh price takes the lookup key, and the old one is archived.
    const price = await createPrice(p, old.product, true);
    await stripe(`prices/${old.id}`, { active: 'false' });
    await stripe(`products/${old.product}`, { description: p.description });
    console.log(`↻ ${p.name} is now ${money(p)} (${price.id}); the old price is archived`);
    continue;
  }
  if (old.currency_options?.jpy?.unit_amount !== p.yen) {
    // Same dollar price; just the yen option to add or change.
    await stripe(`prices/${old.id}`, { 'currency_options[jpy][unit_amount]': String(p.yen) });
    console.log(`✓ ${p.name}: yen price set to ¥${p.yen.toLocaleString('en-US')}`);
    continue;
  }
  console.log(`✓ ${p.name} is already ${money(p)}`);
}
console.log('\nDone. Prices are matched by lookup key, so there is nothing to copy.');
