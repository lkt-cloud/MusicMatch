// Sends push notifications to people's phones and browsers.
//
// The database calls this (with a shared secret, never from a browser) whenever a notification
// is added, with `{ id }`, and once a minute with `{}` to retry anything that didn't go out.
// Browsers get Web Push; the Music Match app gets them through the Expo push service.
import webpush from 'npm:web-push@3.6.7';
import { admin } from '../_shared/supabase.ts';

const SECRET = Deno.env.get('PUSH_HOOK_SECRET') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'https://music-match-beige.vercel.app';
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

type Notification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  actor_id: string | null;
};

type Subscription = { id: string; kind: 'web' | 'expo'; endpoint: string; keys: { p256dh: string; auth: string } | null };

/** Unread messages + unread Bookings-tab notifications: the number on the app icon. */
async function badgeFor(userId: string) {
  const [messages, notices] = await Promise.all([
    admin.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null),
    admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('inbox', true).is('read_at', null),
  ]);
  return (messages.count ?? 0) + (notices.count ?? 0);
}

async function send(n: Notification) {
  const { data: subs } = await admin.from('push_subscriptions').select('id, kind, endpoint, keys').eq('user_id', n.user_id);
  if (!subs?.length) return;
  const badge = await badgeFor(n.user_id);
  // Messages from the same person replace each other instead of piling up.
  const tag = n.kind === 'message' && n.actor_id ? `chat-${n.actor_id}` : `mm-${n.id}`;
  const dead: string[] = [];

  const web = (subs as Subscription[]).filter((s) => s.kind === 'web' && s.keys);
  await Promise.all(
    web.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys! },
          JSON.stringify({ title: n.title, body: n.body, url: n.url, kind: n.kind, tag, badge }),
          { TTL: n.kind === 'message' ? 60 * 60 * 24 : 60 * 60 * 6, urgency: 'high' },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: the browser unsubscribed or the subscription expired.
        if (status === 404 || status === 410) dead.push(s.id);
        else console.warn('web push failed', status, e instanceof Error ? e.message : e);
      }
    }),
  );

  const expo = (subs as Subscription[]).filter((s) => s.kind === 'expo');
  if (expo.length) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(
          expo.map((s) => ({
            to: s.endpoint,
            title: n.title,
            body: n.body,
            data: { url: n.url, kind: n.kind },
            sound: 'default',
            badge,
            channelId: n.kind === 'message' ? 'messages' : 'bookings',
            priority: 'high',
          })),
        ),
      });
      const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      out.data?.forEach((ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') dead.push(expo[i].id);
      });
    } catch (e) {
      console.warn('expo push failed', e instanceof Error ? e.message : e);
    }
  }

  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-hook-secret') !== SECRET) return new Response('Forbidden', { status: 403 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };

  let q = admin
    .from('notifications')
    .select('id, user_id, kind, title, body, url, actor_id')
    .eq('push_wanted', true)
    .is('pushed_at', null)
    .order('created_at')
    .limit(50);
  q = id ? q.eq('id', id) : q.gt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const n of (data ?? []) as Notification[]) {
    // Claim it first, so the per-insert call and the retry job never both send it.
    const { data: claimed } = await admin
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .eq('id', n.id)
      .is('pushed_at', null)
      .select('id');
    if (!claimed?.length) continue;
    await send(n);
    sent++;
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
