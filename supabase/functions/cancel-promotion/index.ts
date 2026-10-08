// Cancels one of the signed-in user's promotions.
// Subscriptions stop renewing and stay on until the end of the period already paid for.
// Boosts are one-time payments, so cancelling one just ends it now (no refund).
import { stripe } from '../_shared/stripe.ts';
import { admin, requireUser } from '../_shared/supabase.ts';
import { json, preflight } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: 'Please sign in first.' }, 401);

  const { promotionId } = (await req.json().catch(() => ({}))) as { promotionId?: string };
  const { data: promo } = await admin
    .from('promotions')
    .select('id, user_id, type, status, stripe_subscription_id')
    .eq('id', promotionId ?? '')
    .single();
  if (!promo || promo.user_id !== user.id) return json({ error: 'Promotion not found.' }, 404);

  if (promo.stripe_subscription_id) {
    await stripe.subscriptions.update(promo.stripe_subscription_id, { cancel_at_period_end: true });
    await admin.from('promotions').update({ cancel_at_period_end: true }).eq('id', promo.id);
  } else {
    await admin
      .from('promotions')
      .update({ status: 'canceled', ends_at: new Date().toISOString() })
      .eq('id', promo.id)
      .in('status', ['pending', 'active']);
  }
  return json({ ok: true });
});
