// Everything that talks to Supabase. Rows are converted to the same shapes the demo
// data uses (Creative, Post, Conversation…) so the pages don't care which mode is on.

import { supabase } from './client';
import type { Attachment, Conversation, Creative, Message, Post, PostKind, Role, Social } from '../data/types';

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
  genres: r.genres ?? [],
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
  if ('genres' in c) row.genres = c.genres;
  if ('available' in c) row.available = c.available;
  if ('socials' in c) row.socials = c.socials;
  if ('avatarId' in c) row.avatar_path = c.avatarId ?? null;
  if ('bannerId' in c) row.banner_path = c.bannerId ?? null;
  if ('featuredPostId' in c) row.featured_post_id = c.featuredPostId ?? null;
  return row;
}

export async function fetchProfiles(): Promise<Creative[]> {
  const { data, error } = await db().from('profiles').select('*').limit(2000);
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

export async function insertMessage(id: string, from: string, to: string, text: string, attachments?: Attachment[]) {
  const { error } = await db()
    .from('messages')
    .insert({ id, sender_id: from, recipient_id: to, text, attachments: attachments ?? [] });
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
