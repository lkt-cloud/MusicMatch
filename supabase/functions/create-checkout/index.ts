// Starts a Stripe Checkout for a promotion. Creates a *pending* promotion row; it only
// becomes active when the stripe-webhook function hears that Stripe took the payment.
import { BOOST_DAYS, PRODUCTS, stripe, type PromotionType } from '../_shared/stripe.ts';
import { admin, requireUser } from '../_shared/supabase.ts';
import { json, preflight } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: 'Please sign in first.' }, 401);

  const body = (await req.json().catch(() => ({}))) as { type?: string; postId?: string };
  const type = body.type as PromotionType;
  const product = PRODUCTS[type];
  if (!product) return json({ error: 'Unknown promotion.' }, 400);

  const { data: profile } = await admin.from('profiles').select('role, also_roles, country').eq('id', user.id).single();
  if (!profile) return json({ error: 'Profile not found.' }, 400);

  // Check what's being promoted, and that it isn't already.
  if (type === 'boost_post') {
    if (!body.postId) return json({ error: 'Choose a post to boost.' }, 400);
    const { data: post } = await admin.from('posts').select('author_id').eq('id', body.postId).single();
    if (!post || post.author_id !== user.id) return json({ error: 'You can only boost your own posts.' }, 403);
    const { count } = await admin
      .from('active_promotions')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', body.postId);
    if (count) return json({ error: 'That post is already boosted.' }, 409);
  } else {
    if (type === 'studio_listing' && profile.role !== 'studio' && !profile.also_roles.includes('studio')) {
      return json({ error: 'Studio listings are for studios. Add Studio to your roles first.' }, 403);
    }
    const { count } = await admin
      .from('active_promotions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('type', type);
    if (count) return json({ error: 'You already have this one running.' }, 409);
  }

  // One Stripe customer per person.
  let { data: customer } = await admin.from('stripe_customers').select('customer_id').eq('user_id', user.id).maybeSingle();
  if (!customer) {
    const created = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
    await admin.from('stripe_customers').insert({ user_id: user.id, customer_id: created.id });
    customer = { customer_id: created.id };
  }

  const { data: prices } = await stripe.prices.list({ lookup_keys: [product.lookupKey], active: true, limit: 1 });
  if (!prices.length) return json({ error: 'Payments aren’t set up yet (missing price in Stripe).' }, 500);

  // People in Japan pay in yen, everyone else in US dollars (each price has a yen option;
  // the app shows prices with the same rule, see src/data/pricing.ts). A Stripe customer
  // who has already paid in one currency has to stay in it.
  const existing = await stripe.customers.retrieve(customer.customer_id);
  const currency = (!existing.deleted && existing.currency) || (profile.country === 'JP' ? 'jpy' : 'usd');

  const { data: promotion, error } = await admin
    .from('promotions')
    .insert({
      user_id: user.id,
      type,
      post_id: type === 'boost_post' ? body.postId : null,
      status: 'pending',
      stripe_customer_id: customer.customer_id,
    })
    .select('id')
    .single();
  if (error || !promotion) return json({ error: 'Couldn’t start checkout.' }, 500);

  const appUrl = Deno.env.get('APP_URL') ?? new URL(req.url).origin;
  const metadata = { promotion_id: promotion.id, user_id: user.id, type };
  const session = await stripe.checkout.sessions.create({
    mode: product.mode,
    customer: customer.customer_id,
    line_items: [{ price: prices[0].id, quantity: 1 }],
    currency,
    client_reference_id: user.id,
    metadata,
    ...(product.mode === 'subscription'
      ? { subscription_data: { metadata } }
      : {
          payment_intent_data: { metadata },
          custom_text: { submit: { message: `Your post is boosted for ${BOOST_DAYS} days once payment goes through.` } },
        }),
    success_url: `${appUrl}/promotions?checkout=success`,
    cancel_url: `${appUrl}/promotions?checkout=canceled`,
  });

  await admin.from('promotions').update({ stripe_checkout_session_id: session.id }).eq('id', promotion.id);
  return json({ url: session.url });
});
