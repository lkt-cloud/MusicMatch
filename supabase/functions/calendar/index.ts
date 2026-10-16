// "Add to calendar": returns a calendar file (.ics) for a booking, which Apple Calendar,
// Outlook and most calendar apps open directly. The link carries the booking's private
// calendar token (only the two people in the booking can see it), so no sign-in is needed.
import { admin } from '../_shared/supabase.ts';

const SITE = Deno.env.get('APP_URL') ?? 'https://music-match-beige.vercel.app';

const SERVICE: Record<string, string> = {
  studio_session: 'Studio session',
  music_video: 'Music video shoot',
  production: 'Production session',
  mixing: 'Mixing session',
  recording: 'Recording session',
  performance: 'Performance',
  session: 'Session',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** iCalendar text: commas, semicolons, backslashes and new lines must be escaped. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Lines longer than 75 bytes are folded, as the format requires. */
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 74) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
};

const name = (p: { name: string; handle: string } | null) => (p ? p.name || p.handle : 'Someone');

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const token = url.searchParams.get('t') ?? '';
  if (!UUID.test(id) || !UUID.test(token)) return new Response('Not found', { status: 404 });

  const { data: b } = await admin
    .from('bookings')
    .select('id, provider_id, client_id, service, starts_at, ends_at, note, place, place_lat, place_lng, status, calendar_token, updated_at')
    .eq('id', id)
    .eq('calendar_token', token)
    .maybeSingle();
  if (!b) return new Response('Not found', { status: 404 });

  const { data: people } = await admin.from('profiles').select('id, name, handle').in('id', [b.provider_id, b.client_id]);
  const provider = people?.find((p) => p.id === b.provider_id) ?? null;
  const client = people?.find((p) => p.id === b.client_id) ?? null;
  const service = SERVICE[b.service] ?? 'Session';
  const details = [
    `${service} booked on Music Match.`,
    `With ${name(provider)} and ${name(client)}.`,
    b.note ? `Note: ${b.note}` : '',
    `${SITE}/bookings`,
  ]
    .filter(Boolean)
    .join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Music Match//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.id}@musicmatch`,
    `DTSTAMP:${stamp(b.updated_at)}`,
    `DTSTART:${stamp(b.starts_at)}`,
    `DTEND:${stamp(b.ends_at)}`,
    `SUMMARY:${esc(`${service}: ${name(provider)} & ${name(client)}`)}`,
    `DESCRIPTION:${esc(details)}`,
    ...(b.place ? [`LOCATION:${esc(b.place)}`] : []),
    ...(b.place_lat != null && b.place_lng != null ? [`GEO:${b.place_lat};${b.place_lng}`] : []),
    `URL:${SITE}/bookings`,
    `STATUS:${b.status === 'cancelled' || b.status === 'declined' ? 'CANCELLED' : b.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(service)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="music-match-session.ics"',
      'Cache-Control': 'no-store',
    },
  });
});
