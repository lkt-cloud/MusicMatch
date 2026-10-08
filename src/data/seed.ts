import type { Conversation, Post } from './types';
import type { ActivePromotion } from '../backend/api';

const now = Date.now();
const min = 60_000;
const hr = 60 * min;
const day = 24 * hr;

export const SEED_POSTS: Post[] = [
  {
    id: 'p1',
    authorId: 'kayawells',
    kind: 'promo',
    text: 'Booking music videos for November. Two open weekends left — Westside warehouse location already locked. DM me your track and I’ll send a treatment.',
    at: now - 42 * min,
    likes: ['dresolace', 'lilmerit', 'junopark'],
    comments: [
      { id: 'c1', authorId: 'lilmerit', text: 'Sending you something tonight 🎥', at: now - 30 * min },
    ],
  },
  {
    id: 'p2',
    authorId: 'southpawsound',
    kind: 'promo',
    text: 'Room A opened up Thursday 8pm–2am after a cancellation. $40/hr instead of $45 for whoever grabs it. Engineer included.',
    at: now - 3 * hr,
    likes: ['tashagrey', 'lilmerit'],
    comments: [],
  },
  {
    id: 'p3',
    authorId: 'lilmerit',
    kind: 'collab',
    text: 'Looking for a producer in the city with a darker, cinematic sound for a 5-track EP. Think strings, heavy 808s, space for storytelling. Let’s cook in person.',
    at: now - 7 * hr,
    likes: ['dresolace', 'junopark', 'kayawells', 'tashagrey'],
    comments: [
      { id: 'c2', authorId: 'dresolace', text: 'This is exactly my lane. Check the Velvet Loop pack on my profile.', at: now - 6 * hr },
      { id: 'c3', authorId: 'junopark', text: 'Down to link as well — I’m in East Atlanta.', at: now - 5 * hr },
    ],
  },
  {
    id: 'p4',
    authorId: 'dresolace',
    kind: 'promo',
    text: 'New sample pack “Red Clay” is out — 12 soul chops recorded on a dusty Rhodes. Free for anyone in the neighborhood who tags me on the release.',
    at: now - day,
    likes: ['lilmerit', 'kayawells'],
    comments: [],
  },
  {
    id: 'p5',
    authorId: 'tashagrey',
    kind: 'question',
    text: 'Artists: do you prefer getting stems back after a mix, or just the final bounce? Trying to decide what to include by default.',
    at: now - 2 * day,
    likes: ['southpawsound'],
    comments: [
      { id: 'c4', authorId: 'lilmerit', text: 'Stems every time. Makes live shows way easier.', at: now - 2 * day + hr },
    ],
  },
  {
    id: 'p6',
    authorId: 'junopark',
    kind: 'collab',
    text: 'Hosting a beat cypher at Southpaw next Sunday. Bring a 16, bring a loop, bring a friend. Free.',
    at: now - 3 * day,
    likes: ['southpawsound', 'dresolace', 'kayawells', 'lilmerit', 'tashagrey'],
    comments: [],
  },
  {
    id: 'p7',
    authorId: 'lilmerit',
    kind: 'promo',
    text: 'My single “Paper Trails” drops Friday 🎧 Produced by @dresolace, video by @kayawells. Pre-save link in my profile — run it up Atlanta.',
    at: now - 5 * hr,
    likes: ['dresolace', 'kayawells', 'junopark'],
    comments: [{ id: 'c5', authorId: 'junopark', text: 'Been waiting on this one!', at: now - 4 * hr }],
  },
  {
    id: 'p8',
    authorId: 'kofimensah',
    kind: 'promo',
    text: 'New grime pack out now — 10 beats, all stems. First 20 people from the community get 30% off. Link in bio.',
    at: now - 2 * hr,
    likes: ['grimelab', 'ellieshaw'],
    comments: [],
  },
  {
    id: 'p9',
    authorId: 'tundeade',
    kind: 'collab',
    text: 'Lagos — looking for an afro-rap vocalist for a summer record. Amapiano log drums, big hook energy. Session at Island Lens studio next week.',
    at: now - 9 * hr,
    likes: ['adanwosu', 'islandlens'],
    comments: [{ id: 'c6', authorId: 'adanwosu', text: 'I’m in. Sending a demo verse.', at: now - 8 * hr }],
  },
  {
    id: 'p10',
    authorId: 'canyonroom',
    kind: 'promo',
    text: 'LA: our live room is free Sunday afternoons in November. Half-day rate for anyone booking through Music Match.',
    at: now - 20 * hr,
    likes: ['niavaughn', '808ezra'],
    comments: [],
  },
  {
    id: 'p11',
    authorId: 'kenjiaoki',
    kind: 'promo',
    text: 'Finished an anime-style visualizer for a lo-fi producer in Tokyo. Hand-drawn frames + rain loops. Open for 2 more projects this month.',
    at: now - 30 * hr,
    likes: ['shibuyasound', 'hanjiwoo'],
    comments: [],
  },
  {
    id: 'p12',
    authorId: 'selahmoore',
    kind: 'question',
    text: 'Mastering engineers — what LUFS are you targeting for streaming these days? Clients keep asking for “as loud as possible.”',
    at: now - 4 * day,
    likes: ['saintluc', 'harbourmix', 'motorcitymix'],
    comments: [{ id: 'c7', authorId: 'saintluc', text: 'Around -9 to -8 for rap, but I always send a dynamic version too.', at: now - 4 * day + 3 * hr }],
  },
];

export const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: 'kayawells',
    withId: 'kayawells',
    unread: true,
    messages: [
      { id: 'm1', from: 'me', text: 'Hey Kaya — saw your post. I’ve got a single dropping in December and want a video.', at: now - 2 * hr },
      { id: 'm2', from: 'kayawells', text: 'Love that. Send me the track and a couple references you like.', at: now - 90 * min },
      { id: 'm3', from: 'kayawells', text: 'I have Nov 15 open if you want to lock it in.', at: now - 20 * min },
    ],
  },
  {
    id: 'dresolace',
    withId: 'dresolace',
    unread: false,
    messages: [
      { id: 'm4', from: 'dresolace', text: 'Yo, sent you three beats. Second one is the one.', at: now - day },
      { id: 'm5', from: 'me', text: 'Second one is crazy. Can we cut it this week?', at: now - day + 2 * hr },
      { id: 'm6', from: 'dresolace', text: 'Bet. I’ll check Southpaw for Thursday.', at: now - day + 3 * hr },
    ],
  },
  {
    id: 'southpawsound',
    withId: 'southpawsound',
    unread: false,
    messages: [
      { id: 'm7', from: 'southpawsound', text: 'Thanks for booking! See you Thursday at 8. Parking is behind the building.', at: now - 3 * day },
    ],
  },
];

/** Sample promotions so demo mode shows what Promoted posts, featured profiles and studio listings look like. */
export const SEED_PROMOTED: ActivePromotion[] = [
  { id: 'demo-boost', userId: 'kofimensah', type: 'boost_post', postId: 'p8', endsAt: null },
  { id: 'demo-featured', userId: 'dresolace', type: 'featured_profile', postId: null, endsAt: null },
  { id: 'demo-studio', userId: 'southpawsound', type: 'studio_listing', postId: null, endsAt: null },
];
