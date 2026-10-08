import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CREATIVES, ME, ME_ID } from './data/creatives';
import { SEED_CONVERSATIONS, SEED_POSTS, SEED_PROMOTED } from './data/seed';
import type { Attachment, Conversation, Creative, Post, PostKind } from './data/types';
import { deleteFile } from './data/attachments';
import { toGenreIds } from './data/genres';
import { LIVE, supabase } from './backend/client';
import * as api from './backend/api';
import type { ActivePromotion } from './backend/api';
import { AuthPage } from './pages/AuthPage';

export type MapMode = 'flat' | 'globe';

/** What every page reads. Demo mode and live (Supabase) mode both provide exactly this. */
export type Store = {
  /** True when connected to Supabase: real accounts, data and payments. */
  live: boolean;
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
  person: (id: string) => Creative;
  /** Adds a post from you and resolves to its id. `featured` also pins it to your profile. */
  addPost: (kind: PostKind, text: string, attachments?: Attachment[], featured?: boolean) => Promise<string>;
  deletePost: (postId: string) => void;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => void;
  sendMessage: (withId: string, text: string, attachments?: Attachment[]) => void;
  deleteMessage: (withId: string, messageId: string) => void;
  deleteConversation: (withId: string) => void;
  markRead: (withId: string) => void;
  updateMe: (patch: Partial<Creative>) => void;
  setMapMode: (mode: MapMode) => void;
  refreshPromotions: () => void;
  signOut?: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  return LIVE ? <LiveGate>{children}</LiveGate> : <DemoProvider>{children}</DemoProvider>;
}

const MAP_MODE_KEY = 'music-match:map-mode';
const readMapMode = (): MapMode => {
  try {
    return localStorage.getItem(MAP_MODE_KEY) === 'globe' ? 'globe' : 'flat';
  } catch {
    return 'flat';
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

type DemoState = { me: Creative; posts: Post[]; conversations: Conversation[]; mapMode: MapMode; seedVersion?: number };

/** Bump when sample posts are added, so existing browsers pick them up. */
const SEED_VERSION = 2;
const STORAGE_KEY = 'music-match:v1';

// Genres used to be free text; keep only the ones on the list.
const migrateMe = (me: Creative): Creative => ({ ...me, genres: toGenreIds(me.genres) });

// Gig, Studio time and Showcase topics were folded into Self-promo.
const migratePost = (p: Post): Post =>
  (['collab', 'promo', 'question'] as string[]).includes(p.kind) ? p : { ...p, kind: 'promo' };

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
        mapMode: saved.mapMode ?? 'flat',
      };
    }
  } catch {
    // storage unavailable or corrupt — fall back to seed data
  }
  return { me: ME, posts: SEED_POSTS, conversations: SEED_CONVERSATIONS, mapMode: 'flat', seedVersion: SEED_VERSION };
}

const FILE_REPLIES = ['Just listened — this is hard 🔥', 'Got it, going through it now.', 'Ooh. Let’s build on this one.'];
const AUTO_REPLIES = [
  'Appreciate you reaching out! What are you working on?',
  'Bet — send me what you have and let’s talk details.',
  'I’m free this week. When works for you?',
  'Love it. Drop a link to the track?',
];

function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(loadDemo);

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

  const pushMessage = (withId: string, from: string, text: string, unread: boolean, attachments?: Attachment[]) =>
    setState((s) => ({
      ...s,
      conversations: withMessage(
        s.conversations,
        withId,
        { id: uid(), from, text, at: Date.now(), ...(attachments?.length ? { attachments } : {}) },
        unread,
      ),
    }));

  const store: Store = {
    live: false,
    meId: ME_ID,
    me: state.me,
    creatives: CREATIVES,
    posts: state.posts,
    conversations: state.conversations,
    promoted: SEED_PROMOTED,
    mapMode: state.mapMode,
    unreadCount: state.conversations.filter((c) => c.unread).length,
    person,
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
    sendMessage(withId, text, attachments) {
      pushMessage(withId, ME_ID, text, false, attachments);
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
    setMapMode: (mapMode) => setState((s) => ({ ...s, mapMode })),
    refreshPromotions: () => undefined,
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
  if (!session) return <AuthPage />;
  return (
    <LiveProvider key={session.user.id} userId={session.user.id}>
      {children}
    </LiveProvider>
  );
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

function LiveProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [profiles, setProfiles] = useState<Creative[] | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [promoted, setPromoted] = useState<ActivePromotion[]>([]);
  const [mapMode, setMapModeState] = useState<MapMode>(readMapMode);
  const [error, setError] = useState<string | null>(null);
  const pendingPatch = useRef<Partial<Creative>>({});
  const saveTimer = useRef<number | undefined>(undefined);

  const fail = useCallback((e: unknown) => {
    console.error(e);
    setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
  }, []);

  const refreshPosts = useCallback(() => api.fetchPosts().then(setPosts).catch(fail), [fail]);
  const refreshPromotions = useCallback(() => api.fetchActivePromotions().then(setPromoted).catch(fail), [fail]);

  // First load.
  useEffect(() => {
    Promise.all([api.fetchProfiles(), api.fetchPosts(), api.fetchMessages(userId), api.fetchActivePromotions()])
      .then(([p, ps, convos, promos]) => {
        setProfiles(p);
        setPosts(ps);
        setConversations(convos);
        setPromoted(promos);
      })
      .catch(fail);
  }, [userId, fail]);

  // Live updates: new messages straight away; posts/comments/likes trigger a refresh.
  useEffect(() => {
    let postsTimer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(postsTimer);
      postsTimer = window.setTimeout(refreshPosts, 400);
    };
    const channel = supabase!
      .channel(`mm-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: row }) => {
        const m = api.toMessage(row as Parameters<typeof api.toMessage>[0]);
        const other = m.from === userId ? m.to : m.from;
        setConversations((cs) => withMessage(cs, other, m, m.from !== userId));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, ({ old }) => {
        const id = (old as { id?: string }).id;
        if (!id) return;
        setConversations((cs) =>
          cs.map((c) => ({ ...c, messages: c.messages.filter((m) => m.id !== id) })).filter((c) => c.messages.length),
        );
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, refreshSoon)
      .subscribe();
    return () => {
      window.clearTimeout(postsTimer);
      supabase!.removeChannel(channel);
    };
  }, [userId, refreshPosts]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const people = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles]);
  // Only people who've set a city show up on the map and in lists. (Memoised: the map re-runs work when this changes.)
  const creatives = useMemo(() => (profiles ?? []).filter((p) => p.id !== userId && p.city), [profiles, userId]);

  if (!profiles) return <Splash text={error ? `Couldn’t load: ${error}` : 'Loading…'} />;
  const me = people.get(userId);
  if (!me) return <Splash text="Setting up your profile…" />;

  const setMe = (patch: Partial<Creative>) => setProfiles((ps) => ps!.map((p) => (p.id === userId ? { ...p, ...patch } : p)));

  const store: Store = {
    live: true,
    meId: userId,
    me,
    creatives,
    posts,
    conversations,
    promoted,
    mapMode,
    unreadCount: conversations.filter((c) => c.unread).length,
    person: (id) => people.get(id) ?? DELETED,
    async addPost(kind, text, attachments, featured = false) {
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
      const id = uid();
      setPosts((ps) =>
        ps.map((p) => (p.id !== postId ? p : { ...p, comments: [...p.comments, { id, authorId: userId, text, at: Date.now() }] })),
      );
      api.insertComment(id, postId, userId, text).catch((e) => {
        fail(e);
        refreshPosts();
      });
    },
    sendMessage(withId, text, attachments) {
      const msg = { id: uid(), from: userId, text, at: Date.now(), ...(attachments?.length ? { attachments } : {}) };
      setConversations((cs) => withMessage(cs, withId, msg, false));
      api.insertMessage(msg.id, userId, withId, text, attachments).catch(fail);
    },
    deleteMessage(withId, messageId) {
      const msg = conversations.find((c) => c.withId === withId)?.messages.find((m) => m.id === messageId);
      setConversations((cs) =>
        cs.map((c) => (c.withId === withId ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) } : c)),
      );
      api.deleteMessage(messageId).then(() => msg && msg.from === userId && forgetFiles([msg]), fail);
    },
    deleteConversation(withId) {
      setConversations((cs) => cs.filter((c) => c.withId !== withId));
      api.deleteConversation(userId, withId).catch(fail);
    },
    markRead(withId) {
      if (!conversations.some((c) => c.withId === withId && c.unread)) return;
      setConversations((cs) => cs.map((c) => (c.withId === withId ? { ...c, unread: false } : c)));
      api.markConversationRead(withId).catch(fail);
    },
    updateMe(patch) {
      // Typing in the profile form saves after a short pause, not on every keystroke.
      setMe(patch);
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
    signOut: () => supabase!.auth.signOut(),
  };

  return (
    <StoreContext.Provider value={store}>
      {children}
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
