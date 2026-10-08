// The only place a promotion is ever switched on. Stripe calls this after payments,
// renewals, failures and cancellations; every event is signature-checked first.
// Objects are re-fetched from Stripe (with the pinned API version) rather than read
// from the event, so this works whatever API version the webhook endpoint uses.
import type Stripe from 'npm:stripe@17.7.0';
import { BOOST_DAYS, cryptoProvider, periodEnd, stripe } from '../_shared/stripe.ts';
import { admin } from '../_shared/supabase.ts';

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (err) {
    console.error('Bad webhook signature', err);
    return new Response('Bad signature', { status: 400 });
  }

  try {
    await handle(event);
  } catch (err) {
    // A 500 makes Stripe retry later, which is what we want for temporary failures.
    console.error(`Failed handling ${event.type}`, err);
    return new Response('Handler error', { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
      if (session.payment_status !== 'paid') return; // e.g. bank transfer still pending
      const promotionId = session.metadata?.promotion_id;
      if (!promotionId) return;

      if (session.mode === 'payment') {
        const now = new Date();
        await admin
          .from('promotions')
          .update({
            status: 'active',
            starts_at: now.toISOString(),
            ends_at: new Date(now.getTime() + BOOST_DAYS * 86_400_000).toISOString(),
          })
          .eq('id', promotionId)
          .eq('status', 'pending'); // a replayed event never extends a boost
      } else if (typeof session.subscription === 'string') {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        await admin
          .from('promotions')
          .update({
            status: 'active',
            starts_at: new Date().toISOString(),
            ends_at: periodEnd(sub).toISOString(),
            stripe_subscription_id: sub.id,
          })
          .eq('id', promotionId);
      }
      return;
    }

    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const promotionId = (event.data.object as Stripe.Checkout.Session).metadata?.promotion_id;
      if (promotionId) await admin.from('promotions').update({ status: 'canceled' }).eq('id', promotionId).eq('status', 'pending');
      return;
    }

    // Renewals: each paid invoice extends the subscription's promotion.
    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const sub = await subscriptionForInvoice((event.data.object as Stripe.Invoice).id);
      if (sub) await syncSubscription(sub);
      return;
    }

    // A failed renewal switches the promotion off straight away.
    case 'invoice.payment_failed': {
      const sub = await subscriptionForInvoice((event.data.object as Stripe.Invoice).id);
      if (sub) await promotionForSubscription(sub).update({ status: 'past_due' });
      return;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
      await syncSubscription(sub);
      return;
    }
  }
}

async function subscriptionForInvoice(invoiceId: string) {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  return subId ? stripe.subscriptions.retrieve(subId) : null;
}

/** Finds the promotion for a subscription: by id once linked, else by the metadata set at checkout. */
function promotionForSubscription(sub: Stripe.Subscription) {
  const promotionId = sub.metadata?.promotion_id;
  return {
    update: (patch: Record<string, unknown>) =>
      promotionId
        ? admin.from('promotions').update({ ...patch, stripe_subscription_id: sub.id }).eq('id', promotionId)
        : admin.from('promotions').update(patch).eq('stripe_subscription_id', sub.id),
  };
}

/** Mirrors a subscription's state onto its promotion. */
async function syncSubscription(sub: Stripe.Subscription) {
  const target = promotionForSubscription(sub);
  switch (sub.status) {
    case 'active':
    case 'trialing':
      await target.update({
        status: 'active',
        ends_at: periodEnd(sub).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
      });
      break;
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      await target.update({ status: 'past_due' });
      break;
    case 'canceled':
    case 'incomplete_expired':
      await target.update({ status: 'canceled', ends_at: new Date().toISOString() });
      break;
  }
}
