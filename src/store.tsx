import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CREATIVES, ME, ME_ID } from './data/creatives';
import { SEED_CONVERSATIONS, SEED_POSTS, SEED_PROMOTED } from './data/seed';
import type {
  Attachment,
  Booking,
  Conversation,
  Creative,
  Notice,
  NotificationPrefs,
  Post,
  PostKind,
  Review,
  ServiceType,
  SharedSlot,
  Slot,
} from './data/types';
import { deleteFile } from './data/attachments';
import { toGenreIds } from './data/genres';
import { LIVE, supabase } from './backend/client';
import * as api from './backend/api';
import type { ActivePromotion, ReportReason, ReportTarget } from './backend/api';
import { AuthPage } from './pages/AuthPage';
import { AREA_MILES } from './map/shared';
import { useSettings } from './settings';
import { forgetDevice, setAppBadge, syncPush } from './push';

export type MapMode = 'flat' | 'globe';

/** What every page reads. Demo mode and live (Supabase) mode both provide exactly this. */
export type Store = {
  /** True when connected to Supabase: real accounts, data and payments. */
  live: boolean;
  /** False for guests browsing without an account (live mode only). */
  signedIn: boolean;
  /** We know roughly where you are: your profile's city, or a guest's shared device location. */
  located: boolean;
  /**
   * For anything that needs an account (posting, liking, messaging…): true if you're signed
   * in, otherwise opens the sign-in box with `why` and returns false.
   */
  requireSignIn: (why?: string) => boolean;
  /** Device location from the map; guests use it as their location. */
  setDeviceLocation: (coords: [number, number]) => void;
  meId: string;
  me: Creative;
  /** Everyone else with a profile on the map. */
  creatives: Creative[];
  posts: Post[];
  conversations: Conversation[];
  /** Promotions running right now (boosted posts, featured profiles, studio listings). */
  promoted: ActivePromotion[];
  mapMode: MapMode;
  unreadCount: number;
  /** Anyone by id. People not loaded yet show as a placeholder for a moment while they load. */
  person: (id: string) => Creative;
  /** Like `person`, but tells you what's going on: undefined while loading, null if there's no such profile. */
  findPerson: (id: string) => Creative | null | undefined;
  /** Loads everyone within the map area around a point (they then appear in `creatives`). */
  loadArea: (center: [number, number]) => void;
  /** Searches everyone by name, handle or genre; matches are added to `creatives`. */
  searchPeople: (query: string) => Promise<Creative[]>;
  /** Adds a post from you and resolves to its id. `featured` also pins it to your profile. */
  addPost: (kind: PostKind, text: string, attachments?: Attachment[], featured?: boolean) => Promise<string>;
  deletePost: (postId: string) => void;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => void;
  /** Sends a message; `slots` attaches some of your booking times. */
  sendMessage: (withId: string, text: string, attachments?: Attachment[], slots?: SharedSlot[]) => void;
  /** Whether someone has Music Match open right now (and hasn't hidden it in Settings). */
  isOnline: (id: string) => boolean;
  /** Someone's booking times that haven't ended, soonest first. Undefined while they load. */
  slotsOf: (userId: string) => Slot[] | undefined;
  /** Adds booking times to your profile. */
  addSlots: (slots: { start: number; end: number; note: string }[]) => void;
  setSlotBooked: (id: string, booked: boolean) => void;
  deleteSlot: (id: string) => void;
  /** Your bookings, as the provider or the client, soonest first. */
  bookings: Booking[];
  /** Asks a provider for one of their open times. */
  requestBooking: (slot: { id: string; start: number; end: number }, providerId: string, service: ServiceType, note: string) => Promise<void>;
  /** The provider accepts or declines a request. */
  respondBooking: (id: string, accept: boolean) => Promise<void>;
  cancelBooking: (id: string) => Promise<void>;
  /** Reviews someone has received, newest first. Undefined while they load. */
  reviewsOf: (userId: string) => Review[] | undefined;
  /** The review you left for a booking, if any. */
  myReviewFor: (bookingId: string) => Review | undefined;
  /** Rates a finished session (or changes your rating). */
  submitReview: (booking: Booking, rating: number, comment: string) => Promise<void>;
  /** Booking news and reminders (the Bookings tab), newest first. */
  notices: Notice[];
  unreadNotices: number;
  markNoticesRead: () => void;
  notificationPrefs: NotificationPrefs;
  setNotificationPrefs: (patch: Partial<NotificationPrefs>) => void;
  /** You can moderate: see reports, remove content, suspend accounts (the /admin page). */
  isAdmin: boolean;
  /** Set when your account is suspended; `until` null means for good. */
  suspension: { until: number | null; reason: string } | null;
  /** A short in-app banner for something that just happened (a message, a booking update). */
  banner: Banner | null;
  dismissBanner: () => void;
  deleteMessage: (withId: string, messageId: string) => void;
  deleteConversation: (withId: string) => void;
  markRead: (withId: string) => void;
  updateMe: (patch: Partial<Creative>) => void;
  setMapMode: (mode: MapMode) => void;
  refreshPromotions: () => void;
  /** People you've blocked. Their posts, comments, profile and messages are hidden from you. */
  blocked: string[];
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  /** Tells us about a post, comment, profile or message that breaks the rules. */
  report: (r: { userId: string; target: ReportTarget; targetId: string; reason: ReportReason; details: string }) => Promise<void>;
  signOut?: () => void;
};

export type Banner = { id: string; title: string; body: string; url: string; actorId: string | null };

const StoreContext = createContext<Store | null>(null);

const DEFAULT_PREFS: NotificationPrefs = { messages: true, bookings: true, reminders: true };
const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
/** Shows banners for a few seconds; not for a conversation you're already looking at. */
function useBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [banner]);
  const show = useCallback((b: Banner) => {
    if (window.location.pathname === b.url) return;
    setBanner(b);
  }, []);
  return [banner, show, () => setBanner(null)] as const;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  return LIVE ? <LiveGate>{children}</LiveGate> : <DemoProvider>{children}</DemoProvider>;
}

// The globe opens first. (v2: the old key remembered the flat map as the default, so it's not reused.)
const MAP_MODE_KEY = 'music-match:map-mode-v2';
const readMapMode = (): MapMode => {
  try {
    return localStorage.getItem(MAP_MODE_KEY) === 'flat' ? 'flat' : 'globe';
  } catch {
    return 'globe';
  }
};
const saveMapMode = (mode: MapMode) => {
  try {
    localStorage.setItem(MAP_MODE_KEY, mode);
  } catch {
    // private mode etc.
  }
};

const uid = () => crypto.randomUUID();

const bySoonest = (a: Slot, b: Slot) => a.start - b.start;
const upcoming = (slots: Slot[]) => slots.filter((s) => s.end > Date.now());

// What a person sees once the people they've blocked are taken out.
const withoutBlocked = {
  posts: (posts: Post[], blocked: string[]) =>
    blocked.length
      ? posts
          .filter((p) => !blocked.includes(p.authorId))
          .map((p) => (p.comments.some((c) => blocked.includes(c.authorId)) ? { ...p, comments: p.comments.filter((c) => !blocked.includes(c.authorId)) } : p))
      : posts,
  conversations: (cs: Conversation[], blocked: string[]) => (blocked.length ? cs.filter((c) => !blocked.includes(c.withId)) : cs),
  creatives: (cs: Creative[], blocked: string[]) => (blocked.length ? cs.filter((c) => !blocked.includes(c.id)) : cs),
};

const forgetFiles = (items: { attachments?: Attachment[] }[]) =>
  items.forEach((m) => m.attachments?.forEach((a) => deleteFile(a.id)));

/** Adds a message to its conversation (moving it to the top); ignores duplicates. */
const withMessage = (convos: Conversation[], withId: string, msg: Conversation['messages'][number], unread: boolean) => {
  const existing = convos.find((c) => c.withId === withId);
  if (existing?.messages.some((m) => m.id === msg.id)) return convos;
  const convo: Conversation = existing
    ? { ...existing, messages: [...existing.messages, msg], unread }
    : { id: withId, withId, messages: [msg], unread };
  return [convo, ...convos.filter((c) => c.withId !== withId)];
};

// =====================================================================================
// Demo mode: sample people, everything saved in this browser.
// =====================================================================================

type DemoState = {
  me: Creative;
  posts: Post[];
  conversations: Conversation[];
  mapMode: MapMode;
  blocked: string[];
  slots: Slot[];
  bookings: Booking[];
  notices: Notice[];
  prefs: NotificationPrefs;
  reviews: Review[];
  seedVersion?: number;
};

/** Bump when sample posts are added, so existing browsers pick them up. */
const SEED_VERSION = 2;
const STORAGE_KEY = 'music-match:v1';

// Genres used to be free text; keep only the ones on the list.
const migrateMe = (me: Creative): Creative => ({ ...me, genres: toGenreIds(me.genres) });

// Gig, Studio time and Showcase topics were folded into Self-promo.
const migratePost = (p: Post): Post =>
  (['collab', 'promo', 'question'] as string[]).includes(p.kind) ? p : { ...p, kind: 'promo' };

/** Sample booking times for a few people, starting tomorrow. */
function seedSlots(): Slot[] {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const at = (d: number, h: number) => day.getTime() + d * 86_400_000 + h * 3_600_000;
  return CREATIVES.filter((c) => c.role !== 'artist')
    .slice(0, 6)
    .flatMap((c, i) =>
      [1, 2, 4].flatMap((d) => [
        { id: uid(), ownerId: c.id, start: at(d + (i % 2), 11), end: at(d + (i % 2), 14), note: '', booked: false },
        { id: uid(), ownerId: c.id, start: at(d + (i % 2), 16), end: at(d + (i % 2), 20), note: d === 4 ? 'Evening session' : '', booked: d === 2 },
      ]),
    );
}

/** A session you had yesterday, waiting for your review. */
function pastSession(): Booking {
  const studio = CREATIVES.find((c) => c.role === 'studio') ?? CREATIVES[0];
  const start = Date.now() - 26 * 3_600_000;
  return {
    id: uid(),
    providerId: studio.id,
    clientId: ME_ID,
    slotId: null,
    service: 'studio_session',
    start,
    end: start + 4 * 3_600_000,
    note: '',
    status: 'confirmed',
    cancelledBy: null,
    createdAt: start - 5 * 86_400_000,
  };
}

const SAMPLE_REVIEWS = [
  'Easy to work with and fast. The final product was better than I pictured.',
  'Professional from start to finish. Already booked again.',
  'Great energy in the room, knows exactly what they want.',
  'Showed up on time, had everything ready. Would recommend.',
];

/** A few sample reviews for each sample person, written by other sample people. */
function seedReviews(): Review[] {
  return CREATIVES.flatMap((c, i) =>
    [0, 1].map((k) => {
      const by = CREATIVES[(i + k + 1) % CREATIVES.length];
      return {
        id: `${c.id}-r${k}`,
        bookingId: `${c.id}-b${k}`,
        reviewerId: by.id,
        revieweeId: c.id,
        service: 'session' as const,
        rating: k === 1 && i % 3 === 0 ? 4 : 5,
        comment: SAMPLE_REVIEWS[(i + k) % SAMPLE_REVIEWS.length],
        at: Date.now() - (12 + 22 * k + i) * 86_400_000,
      };
    }),
  );
}

/** A sample request someone sent you, so the Bookings tab has something to answer. */
function seedBookings(): Booking[] {
  const studio = CREATIVES.find((c) => c.role === 'producer') ?? CREATIVES[0];
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const start = day.getTime() + 2 * 86_400_000 + 19 * 3_600_000;
  return [
    {
      id: uid(),
      providerId: ME_ID,
      clientId: studio.id,
      slotId: null,
      service: 'performance',
      start,
      end: start + 2 * 3_600_000,
      note: 'Opening set at our showcase. 20 minutes.',
      status: 'pending',
      cancelledBy: null,
      createdAt: Date.now(),
    },
    pastSession(),
  ];
}

// In the demo, about half the sample people are "online".
const demoOnline = (id: string) => id === ME_ID || [...id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 2 === 0;

function loadDemo(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<DemoState>;
      // Fill in fields added after this was saved.
      return {
        me: migrateMe({ ...ME, ...saved.me }),
        posts: (saved.posts && (saved.seedVersion ?? 1) < SEED_VERSION
          ? [...saved.posts, ...SEED_POSTS.filter((p) => !saved.posts!.some((x) => x.id === p.id))]
          : saved.posts ?? SEED_POSTS
        ).map(migratePost),
        seedVersion: SEED_VERSION,
        conversations: saved.conversations ?? SEED_CONVERSATIONS,
        mapMode: readMapMode(),
        blocked: saved.blocked ?? [],
        slots: saved.slots ?? seedSlots(),
        // Older saved demos get the sample past session too, so there's something to review.
        bookings: saved.bookings ? (saved.reviews ? saved.bookings : [...saved.bookings, pastSession()]) : seedBookings(),
        reviews: saved.reviews ?? seedReviews(),
        notices: saved.notices ?? [],
        prefs: saved.prefs ?? DEFAULT_PREFS,
      };
    }
  } catch {
    // storage unavailable or corrupt — fall back to seed data
  }
  return { me: ME, posts: SEED_POSTS, conversations: SEED_CONVERSATIONS, mapMode: readMapMode(), blocked: [], slots: seedSlots(), bookings: seedBookings(), notices: [], prefs: DEFAULT_PREFS, reviews: seedReviews(), seedVersion: SEED_VERSION };
}

const FILE_REPLIES = ['Just listened — this is hard 🔥', 'Got it, going through it now.', 'Ooh. Let’s build on this one.'];
const AUTO_REPLIES = [
  'Appreciate you reaching out! What are you working on?',
  'Bet — send me what you have and let’s talk details.',
  'I’m free this week. When works for you?',
  'Love it. Drop a link to the track?',
];

// Everyone's already loaded in the demo.
const noop = () => undefined;
const noSearch = async () => [];

function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(loadDemo);
  const [banner, showBanner, dismissBanner] = useBanner();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / private mode
    }
  }, [state]);

  const people = useMemo(() => {
    const map = new Map<string, Creative>(CREATIVES.map((c) => [c.id, c]));
    map.set(ME_ID, state.me);
    return map;
  }, [state.me]);

  const person = useCallback((id: string) => people.get(id) ?? state.me, [people, state.me]);

  const pushMessage = (withId: string, from: string, text: string, unread: boolean, attachments?: Attachment[], slots?: SharedSlot[]) =>
    setState((s) => ({
      ...s,
      conversations: withMessage(
        s.conversations,
        withId,
        { id: uid(), from, text, at: Date.now(), ...(attachments?.length ? { attachments } : {}), ...(slots?.length ? { slots } : {}) },
        unread,
      ),
    }));

  const posts = useMemo(() => withoutBlocked.posts(state.posts, state.blocked), [state.posts, state.blocked]);
  const conversations = useMemo(() => withoutBlocked.conversations(state.conversations, state.blocked), [state.conversations, state.blocked]);
  const creatives = useMemo(() => withoutBlocked.creatives(CREATIVES, state.blocked), [state.blocked]);

  const store: Store = {
    live: false,
    signedIn: true,
    located: true,
    requireSignIn: () => true,
    setDeviceLocation: () => undefined,
    meId: ME_ID,
    me: state.me,
    creatives,
    posts,
    conversations,
    promoted: SEED_PROMOTED,
    mapMode: state.mapMode,
    unreadCount: conversations.filter((c) => c.unread).length,
    person,
    findPerson: (id) => people.get(id) ?? null,
    loadArea: noop,
    searchPeople: noSearch,
    async addPost(kind, text, attachments, featured = false) {
      const id = uid();
      setState((s) => ({
        ...s,
        me: featured ? { ...s.me, featuredPostId: id } : s.me,
        posts: [
          { id, authorId: ME_ID, kind, text, at: Date.now(), likes: [], comments: [], ...(attachments?.length ? { attachments } : {}) },
          ...s.posts,
        ],
      }));
      return id;
    },
    deletePost(postId) {
      forgetFiles(state.posts.filter((p) => p.id === postId));
      setState((s) => ({
        ...s,
        posts: s.posts.filter((p) => p.id !== postId),
        me: s.me.featuredPostId === postId ? { ...s.me, featuredPostId: undefined } : s.me,
      }));
    },
    toggleLike(postId) {
      setState((s) => ({
        ...s,
        posts: s.posts.map((p) =>
          p.id !== postId ? p : { ...p, likes: p.likes.includes(ME_ID) ? p.likes.filter((l) => l !== ME_ID) : [...p.likes, ME_ID] },
        ),
      }));
    },
    addComment(postId, text) {
      setState((s) => ({
        ...s,
        posts: s.posts.map((p) =>
          p.id !== postId ? p : { ...p, comments: [...p.comments, { id: uid(), authorId: ME_ID, text, at: Date.now() }] },
        ),
      }));
    },
    sendMessage(withId, text, attachments, slots) {
      pushMessage(withId, ME_ID, text, false, attachments, slots);
      // Stand-in for a real person replying, so the demo feels alive.
      const pool = attachments?.length ? FILE_REPLIES : AUTO_REPLIES;
      const reply = pool[Math.floor(Math.random() * pool.length)];
      window.setTimeout(() => pushMessage(withId, withId, reply, true), 1800 + Math.random() * 1500);
    },
    deleteMessage(withId, messageId) {
      forgetFiles(state.conversations.find((c) => c.withId === withId)?.messages.filter((m) => m.id === messageId) ?? []);
      setState((s) => ({
        ...s,
        conversations: s.conversations.map((c) =>
          c.withId === withId ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) } : c,
        ),
      }));
    },
    deleteConversation(withId) {
      forgetFiles(state.conversations.find((c) => c.withId === withId)?.messages ?? []);
      setState((s) => ({ ...s, conversations: s.conversations.filter((c) => c.withId !== withId) }));
    },
    markRead(withId) {
      setState((s) =>
        s.conversations.some((c) => c.withId === withId && c.unread)
          ? { ...s, conversations: s.conversations.map((c) => (c.withId === withId ? { ...c, unread: false } : c)) }
          : s,
      );
    },
    updateMe: (patch) => setState((s) => ({ ...s, me: { ...s.me, ...patch } })),
    setMapMode: (mapMode) => {
      saveMapMode(mapMode);
      setState((s) => ({ ...s, mapMode }));
    },
    refreshPromotions: () => undefined,
    blocked: state.blocked,
    blockUser: (userId) => setState((s) => (s.blocked.includes(userId) ? s : { ...s, blocked: [...s.blocked, userId] })),
    unblockUser: (userId) => setState((s) => ({ ...s, blocked: s.blocked.filter((b) => b !== userId) })),
    // The demo has nowhere to send reports; the real app does.
    report: async () => undefined,
    isOnline: demoOnline,
    slotsOf: (id) => upcoming(state.slots.filter((x) => x.ownerId === id)).sort(bySoonest),
    addSlots: (list) =>
      setState((s) => ({ ...s, slots: [...s.slots, ...list.map((x) => ({ ...x, id: uid(), ownerId: ME_ID, booked: false }))] })),
    setSlotBooked: (id, booked) => setState((s) => ({ ...s, slots: s.slots.map((x) => (x.id === id ? { ...x, booked } : x)) })),
    deleteSlot: (id) => setState((s) => ({ ...s, slots: s.slots.filter((x) => x.id !== id) })),
    bookings: [...state.bookings].sort((a, b) => a.start - b.start),
    async requestBooking(slot, providerId, service, note) {
      const booking: Booking = {
        id: uid(),
        providerId,
        clientId: ME_ID,
        slotId: slot.id,
        service,
        start: slot.start,
        end: slot.end,
        note,
        status: 'pending',
        cancelledBy: null,
        createdAt: Date.now(),
      };
      setState((s) => ({ ...s, bookings: [...s.bookings, booking] }));
      // Stand-in for the provider answering, so the demo shows the whole flow.
      window.setTimeout(() => {
        const name = CREATIVES.find((c) => c.id === providerId)?.name ?? 'They';
        const notice: Notice = {
          id: uid(),
          kind: 'booking_confirmed',
          title: 'Booking confirmed',
          body: `${name} confirmed your booking.`,
          url: '/bookings',
          actorId: providerId,
          bookingId: booking.id,
          read: false,
          at: Date.now(),
        };
        setState((s) => ({
          ...s,
          bookings: s.bookings.map((b) => (b.id === booking.id ? { ...b, status: 'confirmed' } : b)),
          slots: s.slots.map((x) => (x.id === slot.id ? { ...x, booked: true } : x)),
          notices: [notice, ...s.notices],
        }));
        showBanner({ id: notice.id, title: notice.title, body: notice.body, url: notice.url, actorId: providerId });
      }, 2500);
    },
    async respondBooking(id, accept) {
      setState((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === id ? { ...b, status: accept ? 'confirmed' : 'declined' } : b)) }));
    },
    async cancelBooking(id) {
      setState((s) => ({
        ...s,
        bookings: s.bookings.map((b) => (b.id === id ? { ...b, status: 'cancelled', cancelledBy: ME_ID } : b)),
        slots: s.slots.map((x) => (s.bookings.some((b) => b.id === id && b.slotId === x.id) ? { ...x, booked: false } : x)),
      }));
    },
    reviewsOf: (id) => state.reviews.filter((r) => r.revieweeId === id).sort((a, b) => b.at - a.at),
    myReviewFor: (bookingId) => state.reviews.find((r) => r.bookingId === bookingId && r.reviewerId === ME_ID),
    async submitReview(booking, rating, comment) {
      setState((s) => {
        const mine = s.reviews.find((r) => r.bookingId === booking.id && r.reviewerId === ME_ID);
        const review: Review = {
          id: mine?.id ?? uid(),
          bookingId: booking.id,
          reviewerId: ME_ID,
          revieweeId: booking.providerId,
          service: booking.service,
          rating,
          comment,
          at: Date.now(),
        };
        return { ...s, reviews: [review, ...s.reviews.filter((r) => r.id !== review.id)] };
      });
    },
    notices: state.notices,
    unreadNotices: state.notices.filter((n) => !n.read).length,
    markNoticesRead: () =>
      setState((s) => (s.notices.some((n) => !n.read) ? { ...s, notices: s.notices.map((n) => ({ ...n, read: true })) } : s)),
    notificationPrefs: state.prefs,
    setNotificationPrefs: (patch) => setState((s) => ({ ...s, prefs: { ...s.prefs, ...patch } })),
    banner,
    dismissBanner,
    isAdmin: false,
    suspension: null,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

// =====================================================================================
// Live mode: Supabase accounts and data.
// =====================================================================================

function LiveGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Splash />;
  // Signed out, people browse as a guest and are asked to sign in only when they act.
  return <LiveProvider userId={session?.user.id ?? null}>{children}</LiveProvider>;
}

function Splash({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="splash">
      <span className="splash-dot" aria-hidden />
      {text}
    </div>
  );
}

const DELETED: Creative = { ...ME, id: 'deleted', name: 'Deleted account', handle: 'deleted', bio: '', city: '' };
const GUEST_ID = 'guest';
const GUEST: Creative = { ...ME, id: GUEST_ID, name: 'Guest', handle: 'guest', city: '', bio: '', genres: [], coords: [0, 90] };

const LOADING: Creative = { ...DELETED, id: 'loading', name: '…', handle: '' };

function LiveProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  // Everyone loaded so far, by id. Profiles come in a piece at a time (see loadArea, requestProfiles).
  const [profiles, setProfiles] = useState<Map<string, Creative> | null>(null);
  const [, rerender] = useState(0);
  const requested = useRef(new Set<string>()); // ids already asked for
  const missing = useRef(new Set<string>()); // ids that turned out not to exist (deleted accounts)
  const wanted = useRef(new Set<string>()); // ids waiting for the next batch
  const batchTimer = useRef<number | undefined>(undefined);
  const loadedAreas = useRef(new Set<string>());
  const [slotsBy, setSlotsBy] = useState<Map<string, Slot[]>>(new Map());
  const slotsRequested = useRef(new Set<string>());
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [reviewsBy, setReviewsBy] = useState<Map<string, Review[]>>(new Map());
  const reviewsRequested = useRef(new Set<string>());
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [suspension, setSuspension] = useState<Store['suspension']>(null);
  const [banner, showBanner, dismissBanner] = useBanner();
  const { showOnline } = useSettings();
  const [posts, setPosts] = useState<Post[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [promoted, setPromoted] = useState<ActivePromotion[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [mapMode, setMapModeState] = useState<MapMode>(readMapMode);
  const [error, setError] = useState<string | null>(null);
  const [deviceCoords, setDeviceCoords] = useState<[number, number] | null>(null);
  const [signInWhy, setSignInWhy] = useState<string | null>(null);
  const pendingPatch = useRef<Partial<Creative>>({});
  const saveTimer = useRef<number | undefined>(undefined);

  const fail = useCallback((e: unknown) => {
    console.error(e);
    setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
  }, []);

  // Adds profiles to what's loaded. Your own profile isn't overwritten, so edits still being saved aren't lost.
  const mergeProfiles = useCallback(
    (list: Creative[]) => {
      if (!list.length) return;
      setProfiles((m) => {
        const next = new Map(m ?? []);
        for (const p of list) if (!(p.id === userId && next.has(p.id))) next.set(p.id, p);
        return next;
      });
    },
    [userId],
  );

  // Asks for profiles we don't have yet, gathered into one request.
  const requestProfiles = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        if (requested.current.has(id)) continue;
        if (api.isProfileId(id)) wanted.current.add(id);
        else missing.current.add(id);
      }
      if (!wanted.current.size || batchTimer.current !== undefined) return;
      batchTimer.current = window.setTimeout(() => {
        batchTimer.current = undefined;
        const batch = [...wanted.current];
        wanted.current.clear();
        batch.forEach((id) => requested.current.add(id));
        api.fetchProfilesByIds(batch).then(
          (found) => {
            const got = new Set(found.map((p) => p.id));
            batch.forEach((id) => !got.has(id) && missing.current.add(id));
            mergeProfiles(found);
            if (found.length < batch.length) rerender((n) => n + 1);
          },
          (e) => {
            batch.forEach((id) => requested.current.delete(id));
            console.error(e);
          },
        );
      }, 0);
    },
    [mergeProfiles],
  );

  const loadArea = useCallback(
    (center: [number, number]) => {
      const key = `${center[0].toFixed(1)},${center[1].toFixed(1)}`;
      if (loadedAreas.current.has(key)) return;
      loadedAreas.current.add(key);
      api.fetchProfilesNear(center, AREA_MILES).then(mergeProfiles, (e) => {
        loadedAreas.current.delete(key);
        fail(e);
      });
    },
    [mergeProfiles, fail],
  );

  const searchPeople = useCallback(
    async (query: string) => {
      const found = await api.searchProfiles(query);
      mergeProfiles(found);
      return withoutBlocked.creatives(found.filter((p) => p.id !== userId), blocked);
    },
    [mergeProfiles, userId, blocked],
  );

  const refreshPosts = useCallback(() => api.fetchPosts().then(setPosts).catch(fail), [fail]);
  const refreshPromotions = useCallback(() => api.fetchActivePromotions().then(setPromoted).catch(fail), [fail]);

  // Load everything, and again when someone signs in or out. (What's on screen stays put
  // while it reloads, so a half-written post survives signing in.)
  // Your own profile comes first, then everyone around you (guests without a location get the most
  // recently active people instead). Anyone else is loaded when they're needed.
  useEffect(() => {
    if (userId) setSignInWhy(null);
    let current = true;
    (async () => {
      const mine = userId ? await api.fetchProfilesByIds([userId]) : [];
      const home = mine[0]?.coords;
      const [around, ps, convos, promos, blocks] = await Promise.all([
        home ? api.fetchProfilesNear(home, AREA_MILES) : api.fetchRecentProfiles(),
        api.fetchPosts(),
        userId ? api.fetchMessages(userId) : [],
        api.fetchActivePromotions(),
        // Not worth stopping the app over if the list can't be loaded.
        userId ? api.fetchBlocks().catch((e) => (console.error(e), [] as string[])) : [],
      ]);
      if (!current) return;
      requested.current.clear();
      missing.current.clear();
      loadedAreas.current.clear();
      if (home) loadedAreas.current.add(`${home[0].toFixed(1)},${home[1].toFixed(1)}`);
      setProfiles(new Map([...around, ...mine].map((p) => [p.id, p])));
      setPosts(ps);
      setConversations(convos);
      setPromoted(promos);
      setBlocked(blocks);
    })().catch(fail);
    return () => {
      current = false;
    };
  }, [userId, fail]);

  // Load the people behind whatever's on screen: post authors, commenters, conversations, promotions, blocks.
  useEffect(() => {
    if (!profiles) return;
    const ids = new Set<string>();
    for (const p of posts) {
      ids.add(p.authorId);
      p.comments.forEach((c) => ids.add(c.authorId));
    }
    conversations.forEach((c) => ids.add(c.withId));
    promoted.forEach((p) => ids.add(p.userId));
    blocked.forEach((b) => ids.add(b));
    requestProfiles([...ids].filter((id) => !profiles.has(id)));
  }, [profiles, posts, conversations, promoted, blocked, requestProfiles]);

  useEffect(() => () => window.clearTimeout(batchTimer.current), []);

  // Who's online: everyone signed in joins one shared presence channel. If you turned
  // "Show when I'm online" off, you still see others but don't appear yourself.
  useEffect(() => {
    if (!userId) {
      setOnline(new Set());
      return;
    }
    const channel = supabase!.channel('online', { config: { presence: { key: userId } } });
    channel
      .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && showOnline) channel.track({ since: new Date().toISOString() });
      });
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [userId, showOnline]);

  const refreshBookings = useCallback(() => {
    api.fetchBookings().then(setBookings, (e) => console.error(e));
  }, []);

  // Your bookings, notifications and notification settings. Your time zone is saved so
  // reminders arrive at the right local time, and this device is signed up for push again
  // if it already allows notifications.
  useEffect(() => {
    if (!userId) {
      setBookings([]);
      setNotices([]);
      setIsAdmin(false);
      setSuspension(null);
      return;
    }
    api.isAdmin().then(setIsAdmin, () => setIsAdmin(false));
    api.mySuspension().then(setSuspension, () => setSuspension(null));
    refreshBookings();
    api.fetchNotices().then(setNotices, (e) => console.error(e));
    api.fetchReviewsBy(userId).then(setMyReviews, (e) => console.error(e));
    api
      .fetchNotificationPrefs(userId)
      .then((saved) => {
        if (saved) setPrefs({ messages: saved.messages, bookings: saved.bookings, reminders: saved.reminders });
        if (saved?.timezone !== timeZone()) return api.saveNotificationPrefs(userId, { timezone: timeZone() });
      })
      .catch((e) => console.error(e));
    syncPush();
  }, [userId, refreshBookings]);

  // Live updates: new messages straight away; posts/comments/likes trigger a refresh.
  useEffect(() => {
    let postsTimer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(postsTimer);
      postsTimer = window.setTimeout(refreshPosts, 400);
    };
    const channel = supabase!.channel(`mm-${userId ?? GUEST_ID}`);
    if (userId)
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: row }) => {
          const m = api.toMessage(row as Parameters<typeof api.toMessage>[0]);
          const other = m.from === userId ? m.to : m.from;
          setConversations((cs) => withMessage(cs, other, m, m.from !== userId));
          if (m.from !== userId)
            showBanner({
              id: m.id,
              title: '',
              body: m.text || (m.slots?.length ? 'Sent you booking times' : m.attachments?.length ? 'Sent a file' : 'New message'),
              url: `/messages/${m.from}`,
              actorId: m.from,
            });
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, ({ new: row }) => {
          const r = row as Parameters<typeof api.toNotice>[0] & { inbox: boolean };
          if (!r.inbox) return;
          const n = api.toNotice(r);
          setNotices((ns) => (ns.some((x) => x.id === n.id) ? ns : [n, ...ns]));
          showBanner({ id: n.id, title: n.title, body: n.body, url: n.url, actorId: n.actorId });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => refreshBookings())
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, ({ old }) => {
          const id = (old as { id?: string }).id;
          if (!id) return;
          setConversations((cs) =>
            cs.map((c) => ({ ...c, messages: c.messages.filter((m) => m.id !== id) })).filter((c) => c.messages.length),
          );
        });
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, refreshSoon)
      .subscribe();
    return () => {
      window.clearTimeout(postsTimer);
      supabase!.removeChannel(channel);
    };
  }, [userId, refreshPosts, refreshBookings, showBanner]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  // Only people who've set a city show up on the map and in lists. (Memoised: the map re-runs work when this changes.)
  const creatives = useMemo(
    () => withoutBlocked.creatives([...(profiles?.values() ?? [])].filter((p) => p.id !== userId && p.city), blocked),
    [profiles, userId, blocked],
  );
  const visiblePosts = useMemo(() => withoutBlocked.posts(posts, blocked), [posts, blocked]);
  const visibleConversations = useMemo(() => withoutBlocked.conversations(conversations, blocked), [conversations, blocked]);
  const unreadNotices = notices.filter((n) => !n.read).length;
  const unreadTotal = visibleConversations.filter((c) => c.unread).length + unreadNotices;
  useEffect(() => setAppBadge(userId ? unreadTotal : 0), [userId, unreadTotal]);

  if (!profiles) return <Splash text={error ? `Couldn’t load: ${error}` : 'Loading…'} />;
  // Guests (and, for a moment, someone who's just signed up) get a placeholder profile.
  const guest = { ...GUEST, coords: deviceCoords ?? GUEST.coords };
  const me = (userId && profiles.get(userId)) || guest;
  const meId = userId ?? GUEST_ID;

  const setMe = (patch: Partial<Creative>) =>
    setProfiles((m) => {
      const mine = userId && m?.get(userId);
      if (!mine) return m;
      return new Map(m).set(userId, { ...mine, ...patch });
    });

  const findPerson = (id: string): Creative | null | undefined => {
    const p = profiles.get(id);
    if (p) return p;
    if (missing.current.has(id)) return null;
    requestProfiles([id]);
    return undefined;
  };

  const requireSignIn = (why?: string) => {
    if (userId) return true;
    setSignInWhy(why ?? 'Sign in to keep going.');
    return false;
  };

  const store: Store = {
    live: true,
    signedIn: !!userId,
    located: !!userId || !!deviceCoords,
    requireSignIn,
    setDeviceLocation(coords) {
      setDeviceCoords(coords);
      loadArea(coords);
    },
    meId,
    me,
    creatives,
    posts: visiblePosts,
    conversations: visibleConversations,
    promoted,
    mapMode,
    unreadCount: visibleConversations.filter((c) => c.unread).length,
    person: (id) => {
      const p = findPerson(id);
      return p ?? (p === null ? DELETED : { ...LOADING, id });
    },
    findPerson,
    loadArea,
    searchPeople,
    async addPost(kind, text, attachments, featured = false) {
      if (!requireSignIn('Sign in to post in Community.') || !userId) throw new Error('Sign in to post.');
      const post: Post = {
        id: uid(),
        authorId: userId,
        kind,
        text,
        at: Date.now(),
        likes: [],
        comments: [],
        ...(attachments?.length ? { attachments } : {}),
      };
      setPosts((ps) => [post, ...ps]);
      try {
        await api.insertPost(post);
        if (featured) {
          setMe({ featuredPostId: post.id });
          await api.updateProfile(userId, { featuredPostId: post.id });
        }
      } catch (e) {
        setPosts((ps) => ps.filter((p) => p.id !== post.id));
        fail(e);
        throw e;
      }
      return post.id;
    },
    deletePost(postId) {
      if (!userId) return;
      const post = posts.find((p) => p.id === postId);
      setPosts((ps) => ps.filter((p) => p.id !== postId));
      if (me.featuredPostId === postId) setMe({ featuredPostId: undefined });
      api.deletePost(postId).then(
        () => post && forgetFiles([post]),
        (e) => {
          fail(e);
          refreshPosts();
        },
      );
    },
    toggleLike(postId) {
      if (!requireSignIn('Sign in to like posts.') || !userId) return;
      const liked = posts.find((p) => p.id === postId)?.likes.includes(userId);
      setPosts((ps) =>
        ps.map((p) => (p.id !== postId ? p : { ...p, likes: liked ? p.likes.filter((l) => l !== userId) : [...p.likes, userId] })),
      );
      api.setLike(postId, userId, !liked).catch((e) => {
        fail(e);
        refreshPosts();
      });
    },
    addComment(postId, text) {
      if (!requireSignIn('Sign in to reply.') || !userId) return;
      const id = uid();
      setPosts((ps) =>
        ps.map((p) => (p.id !== postId ? p : { ...p, comments: [...p.comments, { id, authorId: userId, text, at: Date.now() }] })),
      );
      api.insertComment(id, postId, userId, text).catch((e) => {
        fail(e);
        refreshPosts();
      });
    },
    sendMessage(withId, text, attachments, slots) {
      if (!requireSignIn('Sign in to send messages.') || !userId) return;
      const msg = {
        id: uid(),
        from: userId,
        text,
        at: Date.now(),
        ...(attachments?.length ? { attachments } : {}),
        ...(slots?.length ? { slots } : {}),
      };
      setConversations((cs) => withMessage(cs, withId, msg, false));
      api.insertMessage(msg.id, userId, withId, text, attachments, slots).catch(fail);
    },
    isOnline: (id) => online.has(id),
    slotsOf(id) {
      const list = slotsBy.get(id);
      if (list) return upcoming(list);
      if (!slotsRequested.current.has(id) && api.isProfileId(id)) {
        slotsRequested.current.add(id);
        api.fetchSlots(id).then(
          (found) => setSlotsBy((m) => new Map(m).set(id, found)),
          (e) => {
            console.error(e);
            setSlotsBy((m) => new Map(m).set(id, []));
          },
        );
      }
      return undefined;
    },
    addSlots(list) {
      if (!requireSignIn('Sign in to set your booking times.') || !userId) return;
      const added: Slot[] = list.map((x) => ({ ...x, id: uid(), ownerId: userId, booked: false }));
      const ids = new Set(added.map((x) => x.id));
      setSlotsBy((m) => new Map(m).set(userId, [...(m.get(userId) ?? []), ...added].sort(bySoonest)));
      api.insertSlots(added).catch((e) => {
        setSlotsBy((m) => new Map(m).set(userId, (m.get(userId) ?? []).filter((x) => !ids.has(x.id))));
        fail(e);
      });
    },
    setSlotBooked(id, booked) {
      if (!userId) return;
      const change = (b: boolean) =>
        setSlotsBy((m) => new Map(m).set(userId, (m.get(userId) ?? []).map((x) => (x.id === id ? { ...x, booked: b } : x))));
      change(booked);
      api.setSlotBooked(id, booked).catch((e) => {
        change(!booked);
        fail(e);
      });
    },
    deleteSlot(id) {
      if (!userId) return;
      const removed = slotsBy.get(userId)?.find((x) => x.id === id);
      setSlotsBy((m) => new Map(m).set(userId, (m.get(userId) ?? []).filter((x) => x.id !== id)));
      api.deleteSlot(id).catch((e) => {
        if (removed) setSlotsBy((m) => new Map(m).set(userId, [...(m.get(userId) ?? []), removed].sort(bySoonest)));
        fail(e);
      });
    },
    deleteMessage(withId, messageId) {
      if (!userId) return;
      const msg = conversations.find((c) => c.withId === withId)?.messages.find((m) => m.id === messageId);
      setConversations((cs) =>
        cs.map((c) => (c.withId === withId ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) } : c)),
      );
      api.deleteMessage(messageId).then(() => msg && msg.from === userId && forgetFiles([msg]), fail);
    },
    deleteConversation(withId) {
      if (!userId) return;
      setConversations((cs) => cs.filter((c) => c.withId !== withId));
      api.deleteConversation(userId, withId).catch(fail);
    },
    markRead(withId) {
      if (!userId || !conversations.some((c) => c.withId === withId && c.unread)) return;
      setConversations((cs) => cs.map((c) => (c.withId === withId ? { ...c, unread: false } : c)));
      api.markConversationRead(withId).catch(fail);
    },
    updateMe(patch) {
      if (!requireSignIn('Sign in to set up your profile.') || !userId) return;
      // Typing in the profile form saves after a short pause, not on every keystroke.
      setMe(patch);
      if (patch.coords) loadArea(patch.coords);
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const toSave = pendingPatch.current;
        pendingPatch.current = {};
        api.updateProfile(userId, toSave).catch(fail);
      }, 600);
    },
    setMapMode(mode) {
      setMapModeState(mode);
      saveMapMode(mode);
    },
    refreshPromotions,
    blocked,
    blockUser(other) {
      if (!requireSignIn('Sign in to block people.') || !userId || other === userId || blocked.includes(other)) return;
      setBlocked((b) => [...b, other]);
      api.addBlock(userId, other).catch((e) => {
        setBlocked((b) => b.filter((x) => x !== other));
        fail(e);
      });
    },
    unblockUser(other) {
      if (!userId || !blocked.includes(other)) return;
      setBlocked((b) => b.filter((x) => x !== other));
      api.removeBlock(userId, other).catch((e) => {
        setBlocked((b) => [...b, other]);
        fail(e);
      });
    },
    async report(r) {
      if (!requireSignIn('Sign in to report something.') || !userId) throw new Error('Sign in to report.');
      await api.insertReport({ reporterId: userId, reportedUserId: r.userId, target: r.target, targetId: r.targetId, reason: r.reason, details: r.details });
    },
    bookings,
    // The database finds the provider from the booking time itself.
    async requestBooking(slot, _providerId, service, note) {
      if (!requireSignIn('Sign in to book.') || !userId) throw new Error('Sign in to book.');
      await api.requestBooking(slot.id, service, note);
      refreshBookings();
    },
    async respondBooking(id, accept) {
      await api.respondBooking(id, accept);
      refreshBookings();
      // Your booking times change when you accept one.
      if (accept && userId) {
        slotsRequested.current.delete(userId);
        setSlotsBy((m) => {
          const next = new Map(m);
          next.delete(userId);
          return next;
        });
      }
    },
    async cancelBooking(id) {
      await api.cancelBooking(id);
      refreshBookings();
      if (userId) {
        slotsRequested.current.delete(userId);
        setSlotsBy((m) => {
          const next = new Map(m);
          next.delete(userId);
          return next;
        });
      }
    },
    reviewsOf(id) {
      const list = reviewsBy.get(id);
      if (list) return list;
      if (!reviewsRequested.current.has(id) && api.isProfileId(id)) {
        reviewsRequested.current.add(id);
        api.fetchReviewsFor(id).then(
          (found) => setReviewsBy((m) => new Map(m).set(id, found)),
          (e) => {
            console.error(e);
            setReviewsBy((m) => new Map(m).set(id, []));
          },
        );
      }
      return undefined;
    },
    myReviewFor: (bookingId) => myReviews.find((r) => r.bookingId === bookingId),
    async submitReview(booking, rating, comment) {
      if (!userId) return;
      await api.submitReview(booking.id, rating, comment);
      // Fresh copies: your review, their list of reviews and their new average.
      const [mine, theirs, profile] = await Promise.all([
        api.fetchReviewsBy(userId),
        api.fetchReviewsFor(booking.providerId),
        api.fetchProfilesByIds([booking.providerId]),
      ]);
      setMyReviews(mine);
      setReviewsBy((m) => new Map(m).set(booking.providerId, theirs));
      mergeProfiles(profile);
    },
    notices,
    unreadNotices,
    markNoticesRead() {
      if (!unreadNotices) return;
      setNotices((ns) => ns.map((n) => ({ ...n, read: true })));
      api.markNoticesRead().catch((e) => console.error(e));
    },
    notificationPrefs: prefs,
    setNotificationPrefs(patch) {
      if (!userId) return;
      const before = prefs;
      setPrefs({ ...prefs, ...patch });
      api.saveNotificationPrefs(userId, patch).catch((e) => {
        setPrefs(before);
        fail(e);
      });
    },
    banner,
    dismissBanner,
    isAdmin,
    suspension,
    signOut: userId
      ? async () => {
          await forgetDevice();
          await supabase!.auth.signOut();
        }
      : undefined,
  };

  return (
    <StoreContext.Provider value={store}>
      {children}
      {signInWhy && <AuthPage reason={signInWhy} onClose={() => setSignInWhy(null)} />}
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button className="icon-btn ghost" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </StoreContext.Provider>
  );
}
