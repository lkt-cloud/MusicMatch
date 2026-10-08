// Permanently deletes the signed-in user's account (required by the App Store and Google Play).
// Order matters: stop any paid subscriptions first so nobody is charged again, then remove
// their uploaded files, then the account itself. Deleting the account removes their profile,
// posts, comments, likes, messages and promotions too (the tables cascade).
import { stripe } from '../_shared/stripe.ts';
import { admin, requireUser } from '../_shared/supabase.ts';
import { json, preflight } from '../_shared/http.ts';

/** Every file path under `prefix/` in a bucket (folders are listed one level at a time). */
async function listAll(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // Folders come back without an id.
      if (item.id) out.push(path);
      else out.push(...(await listAll(bucket, path)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: 'Please sign in first.' }, 401);

  // 1. Stop subscriptions (Featured profile, Studio listing) straight away.
  const { data: subs } = await admin
    .from('promotions')
    .select('stripe_subscription_id')
    .eq('user_id', user.id)
    .not('stripe_subscription_id', 'is', null)
    .in('status', ['pending', 'active', 'past_due']);
  for (const { stripe_subscription_id: id } of subs ?? []) {
    try {
      await stripe.subscriptions.cancel(id);
    } catch (e) {
      // Already canceled or gone in Stripe: nothing left to stop.
      console.warn('cancel subscription', id, e instanceof Error ? e.message : e);
    }
  }

  // 2. Their photos, videos and message files.
  for (const bucket of ['media', 'message-files']) {
    const paths = await listAll(bucket, user.id);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) console.warn('remove files', bucket, error.message);
    }
  }

  // 3. The account (and, by cascade, everything else of theirs).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: 'Couldn’t delete the account. Try again, or contact support.' }, 500);
  return json({ ok: true });
});
