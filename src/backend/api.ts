// Everything that talks to Supabase. Rows are converted to the same shapes the demo
// data uses (Creative, Post, Conversation…) so the pages don't care which mode is on.

import { supabase } from './client';
import { toGenreIds } from '../data/genres';
import type { Attachment, Conversation, Creative, Message, Post, PostKind, Role, SharedSlot, Slot, Social } from '../data/types';

const db = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

// ------------------------------------------------------------------ profiles

type ProfileRow = {
  id: string;
  handle: string;
  name: string;
  role: Role;
  also_roles: Role[];
  country: string;
  city: string;
  lng: number;
  lat: number;
  address: string | null;
  travel_miles: number | null;
  bio: string;
  rate: string;
  role_rates: Partial<Record<Role, string>> | null;
  exact_location: boolean;
  genres: string[];
  available: boolean;
  socials: Social[];
  avatar_path: string | null;
  banner_path: string | null;
  featured_post_id: string | null;
};

const toCreative = (r: ProfileRow): Creative => ({
  id: r.id,
  handle: r.handle,
  name: r.name || r.handle,
  role: r.role,
  alsoRoles: r.also_roles ?? [],
  country: r.country,
  city: r.city,
  coords: [r.lng, r.lat],
  exactLocation: r.exact_location,
  address: r.address ?? undefined,
  travelMiles: r.travel_miles ?? undefined,
  bio: r.bio,
  rate: r.rate,
  roleRates: r.role_rates ?? {},
  rating: 0,
  reviews: 0,
  genres: toGenreIds(r.genres ?? []),
  available: r.available,
  work: [],
  socials: r.socials ?? [],
  avatarId: r.avatar_path ?? undefined,
  bannerId: r.banner_path ?? undefined,
  featuredPostId: r.featured_post_id ?? undefined,
});

/** The profile columns a person may change about themselves. */
export function profilePatch(c: Partial<Creative>) {
  const row: Record<string, unknown> = {};
  if ('name' in c) row.name = c.name;
  if ('role' in c) row.role = c.role;
  if ('alsoRoles' in c) row.also_roles = c.alsoRoles;
  if ('country' in c) row.country = c.country;
  if ('city' in c) row.city = c.city;
  if (c.coords) [row.lng, row.lat] = c.coords;
  if ('address' in c) row.address = c.address ?? null;
  if ('travelMiles' in c) row.travel_miles = c.travelMiles ?? null;
  if ('bio' in c) row.bio = c.bio;
  if ('rate' in c) row.rate = c.rate;
  if ('roleRates' in c) row.role_rates = c.roleRates ?? {};
  if ('exactLocation' in c) row.exact_location = !!c.exactLocation;
  if ('genres' in c) row.genres = toGenreIds(c.genres ?? []);
  if ('available' in c) row.available = c.available;
  if ('socials' in c) row.socials = c.socials;
  if ('avatarId' in c) row.avatar_path = c.avatarId ?? null;
  if ('bannerId' in c) row.banner_path = c.bannerId ?? null;
  if ('featuredPostId' in c) row.featured_post_id = c.featuredPostId ?? null;
  return row;
}

// Profiles are loaded a piece at a time instead of all at once: the people in a map area,
// the people behind the posts and messages on screen, and search results.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isProfileId = (id: string) => UUID.test(id);

/** Profiles by id. Ids that don't exist (deleted accounts) are simply missing from the result. */
export async function fetchProfilesByIds(ids: string[]): Promise<Creative[]> {
  const valid = [...new Set(ids)].filter(isProfileId);
  const out: Creative[] = [];
  // Batches, so the request URL stays a sensible length.
  for (let i = 0; i < valid.length; i += 100) {
    const { data, error } = await db().from('profiles').select('*').in('id', valid.slice(i, i + 100));
    if (error) throw error;
    out.push(...(data as ProfileRow[]).map(toCreative));
  }
  return out;
}

const MILES_PER_DEGREE = 69;

/** Everyone on the map within roughly `miles` of a point (a lat/lng box around it). */
export async function fetchProfilesNear([lng, lat]: [number, number], miles: number, limit = 1000): Promise<Creative[]> {
  const dLat = miles / MILES_PER_DEGREE;
  let q = db()
    .from('profiles')
    .select('*')
    .neq('city', '')
    .gte('lat', lat - dLat)
    .lte('lat', lat + dLat);
  const dLng = miles / (MILES_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  // Near the poles or across the 180° line the box doesn't fit in one range; latitude alone is enough there.
  if (Math.abs(lat) + dLat < 85 && lng - dLng > -180 && lng + dLng < 180) q = q.gte('lng', lng - dLng).lte('lng', lng + dLng);
  const { data, error } = await q.limit(limit);
  if (error) throw error;
  return (data as ProfileRow[]).map(toCreative);
}

/** The most recently active people, for guests who haven't shared a location yet. */
export async function fetchRecentProfiles(limit = 300): Promise<Creative[]> {
  const { data, error } = await db().from('profiles').select('*').neq('city', '').order('updated_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as ProfileRow[]).map(toCreative);
}

/** People whose name or handle contains the search, or who have it as a genre. */
export async function searchProfiles(query: string, limit = 20): Promise<Creative[]> {
  // Characters that mean something in the filter syntax are dropped.
  const term = query.replace(/[%,()*\\"{}]/g, ' ').trim();
  if (term.length < 2) return [];
  const genre = term.toLowerCase().replace(/\s+/g, '-');
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .neq('city', '')
    .or(`name.ilike.%${term}%,handle.ilike.%${term}%,genres.cs.{${genre}}`)
    .limit(limit);
  if (error) throw error;
  return (data as ProfileRow[]).map(toCreative);
}

export async function updateProfile(id: string, patch: Partial<Creative>) {
  const row = profilePatch(patch);
  if (!Object.keys(row).length) return;
  const { error } = await db().from('profiles').update(row).eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------------------ posts

type PostRow = {
  id: string;
  author_id: string;
  kind: PostKind;
  text: string;
  attachments: Attachment[];
  created_at: string;
  post_likes: { user_id: string }[];
  comments: { id: string; author_id: string; text: string; created_at: string }[];
};

const toPost = (r: PostRow): Post => ({
  id: r.id,
  authorId: r.author_id,
  kind: r.kind,
  text: r.text,
  at: Date.parse(r.created_at),
  likes: r.post_likes.map((l) => l.user_id),
  comments: r.comments
    .map((c) => ({ id: c.id, authorId: c.author_id, text: c.text, at: Date.parse(c.created_at) }))
    .sort((a, b) => a.at - b.at),
  ...(r.attachments?.length ? { attachments: r.attachments } : {}),
});

export async function fetchPosts(): Promise<Post[]> {
  const { data, error } = await db()
    .from('posts')
    .select('id, author_id, kind, text, attachments, created_at, post_likes(user_id), comments(id, author_id, text, created_at)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data as PostRow[]).map(toPost);
}

export async function insertPost(post: Post) {
  const { error } = await db().from('posts').insert({
    id: post.id,
    author_id: post.authorId,
    kind: post.kind,
    text: post.text,
    attachments: post.attachments ?? [],
  });
  if (error) throw error;
}

export async function deletePost(id: string) {
  const { error } = await db().from('posts').delete().eq('id', id);
  if (error) throw error;
}

export async function setLike(postId: string, userId: string, liked: boolean) {
  const q = db().from('post_likes');
  const { error } = liked
    ? await q.insert({ post_id: postId, user_id: userId })
    : await q.delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}

export async function insertComment(id: string, postId: string, authorId: string, text: string) {
  const { error } = await db().from('comments').insert({ id, post_id: postId, author_id: authorId, text });
  if (error) throw error;
}

// ------------------------------------------------------------------ messages

type MessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  text: string;
  attachments: Attachment[];
  slots?: SharedSlot[];
  read_at: string | null;
  created_at: string;
};

export const toMessage = (r: MessageRow): Message & { to: string; readAt: string | null } => ({
  id: r.id,
  from: r.sender_id,
  to: r.recipient_id,
  text: r.text,
  at: Date.parse(r.created_at),
  readAt: r.read_at,
  ...(r.attachments?.length ? { attachments: r.attachments } : {}),
  ...(r.slots?.length ? { slots: r.slots } : {}),
});

/** Groups my messages into conversations, newest first. */
export function toConversations(rows: MessageRow[], meId: string): Conversation[] {
  const byPerson = new Map<string, Conversation>();
  for (const r of [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    const other = r.sender_id === meId ? r.recipient_id : r.sender_id;
    const convo = byPerson.get(other) ?? { id: other, withId: other, messages: [], unread: false };
    convo.messages.push(toMessage(r));
    if (r.recipient_id === meId && !r.read_at) convo.unread = true;
    byPerson.set(other, convo);
  }
  return [...byPerson.values()].sort((a, b) => b.messages[b.messages.length - 1].at - a.messages[a.messages.length - 1].at);
}

export async function fetchMessages(meId: string): Promise<Conversation[]> {
  const { data, error } = await db().from('messages').select('*').order('created_at', { ascending: true }).limit(5000);
  if (error) throw error;
  return toConversations(data as MessageRow[], meId);
}

export async function insertMessage(id: string, from: string, to: string, text: string, attachments?: Attachment[], slots?: SharedSlot[]) {
  const { error } = await db()
    .from('messages')
    // `slots` is only sent when there are some, so plain messages work even before that column exists.
    .insert({ id, sender_id: from, recipient_id: to, text, attachments: attachments ?? [], ...(slots?.length ? { slots } : {}) });
  if (error) throw error;
}

export async function deleteMessage(id: string) {
  const { error } = await db().from('messages').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteConversation(meId: string, other: string) {
  const { error } = await db()
    .from('messages')
    .delete()
    .or(`and(sender_id.eq.${meId},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${meId})`);
  if (error) throw error;
}

export async function markConversationRead(other: string) {
  const { error } = await db().rpc('mark_conversation_read', { other });
  if (error) throw error;
}

// ------------------------------------------------------------------ booking times

type SlotRow = { id: string; owner_id: string; starts_at: string; ends_at: string; note: string; booked: boolean };

const toSlot = (r: SlotRow): Slot => ({
  id: r.id,
  ownerId: r.owner_id,
  start: Date.parse(r.starts_at),
  end: Date.parse(r.ends_at),
  note: r.note,
  booked: r.booked,
});

/** Someone's booking times that haven't ended yet, soonest first. */
export async function fetchSlots(ownerId: string): Promise<Slot[]> {
  const { data, error } = await db()
    .from('booking_slots')
    .select('id, owner_id, starts_at, ends_at, note, booked')
    .eq('owner_id', ownerId)
    .gt('ends_at', new Date().toISOString())
    .order('starts_at')
    .limit(300);
  if (error) throw error;
  return (data as SlotRow[]).map(toSlot);
}

export async function insertSlots(slots: Slot[]) {
  const { error } = await db()
    .from('booking_slots')
    .insert(
      slots.map((s) => ({
        id: s.id,
        owner_id: s.ownerId,
        starts_at: new Date(s.start).toISOString(),
        ends_at: new Date(s.end).toISOString(),
        note: s.note,
        booked: s.booked,
      })),
    );
  if (error) throw error;
}

export async function setSlotBooked(id: string, booked: boolean) {
  const { error } = await db().from('booking_slots').update({ booked }).eq('id', id);
  if (error) throw error;
}

export async function deleteSlot(id: string) {
  const { error } = await db().from('booking_slots').delete().eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------------------ report & block

export type ReportTarget = 'post' | 'comment' | 'profile' | 'message';
export type ReportReason = 'spam' | 'harassment' | 'sexual' | 'violence' | 'impersonation' | 'copyright' | 'other';

export async function fetchBlocks(): Promise<string[]> {
  const { data, error } = await db().from('blocks').select('blocked_id');
  if (error) throw error;
  return data.map((r) => r.blocked_id as string);
}

export async function addBlock(blockerId: string, blockedId: string) {
  const { error } = await db().from('blocks').upsert({ blocker_id: blockerId, blocked_id: blockedId }, { ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeBlock(blockerId: string, blockedId: string) {
  const { error } = await db().from('blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  if (error) throw error;
}

export async function insertReport(report: {
  reporterId: string;
  reportedUserId: string;
  target: ReportTarget;
  targetId: string;
  reason: ReportReason;
  details: string;
}) {
  const { error } = await db().from('reports').insert({
    reporter_id: report.reporterId,
    reported_user_id: report.reportedUserId,
    target_type: report.target,
    target_id: report.targetId,
    reason: report.reason,
    details: report.details,
  });
  if (error) throw error;
}

// ------------------------------------------------------------------ promotions

export type PromotionType = 'boost_post' | 'featured_profile' | 'studio_listing';

/** A promotion that's live right now (what everyone sees). */
export type ActivePromotion = { id: string; userId: string; type: PromotionType; postId: string | null; endsAt: string | null };

/** One of my promotions, with its full status. */
export type MyPromotion = ActivePromotion & {
  status: 'pending' | 'active' | 'past_due' | 'canceled' | 'expired';
  startsAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
};

export async function fetchActivePromotions(): Promise<ActivePromotion[]> {
  const { data, error } = await db().from('active_promotions').select('id, user_id, type, post_id, ends_at');
  if (error) throw error;
  return data.map((r) => ({ id: r.id, userId: r.user_id, type: r.type, postId: r.post_id, endsAt: r.ends_at }));
}

export async function fetchMyPromotions(): Promise<MyPromotion[]> {
  const { data, error } = await db()
    .from('promotions')
    .select('id, user_id, type, post_id, status, starts_at, ends_at, cancel_at_period_end, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    postId: r.post_id,
    endsAt: r.ends_at,
    status: r.status,
    startsAt: r.starts_at,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    createdAt: r.created_at,
  }));
}

async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke(name, { body });
  if (error) {
    // The function's own error message is in the response body.
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

/** Sends the browser to Stripe Checkout. Nothing is activated until Stripe confirms payment. */
export async function startCheckout(type: PromotionType, postId?: string) {
  const { url } = await callFunction<{ url: string }>('create-checkout', { type, postId });
  window.location.assign(url);
}

export async function cancelPromotion(promotionId: string) {
  await callFunction('cancel-promotion', { promotionId });
}

// ------------------------------------------------------------------ account (Settings)

/** The signed-in person's email address. */
export async function currentEmail() {
  const { data } = await db().auth.getUser();
  return data.user?.email ?? null;
}

/** Sends a confirmation link to the new address; the change happens when it's clicked. */
export async function changeEmail(email: string) {
  const { error } = await db().auth.updateUser({ email }, { emailRedirectTo: `${window.location.origin}/settings` });
  if (error) throw error;
}

export async function changePassword(password: string) {
  const { error } = await db().auth.updateUser({ password });
  if (error) throw error;
}

/** Deletes the account and everything in it (subscriptions are cancelled first), then signs out. */
export async function deleteAccount() {
  await callFunction('delete-account', {});
  await db().auth.signOut({ scope: 'local' });
}
