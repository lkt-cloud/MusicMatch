export type Role = 'artist' | 'producer' | 'videographer' | 'studio' | 'engineer';

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'spotify'
  | 'applemusic'
  | 'soundcloud'
  | 'audiomack'
  | 'beatstars'
  | 'bandcamp'
  | 'x'
  | 'threads'
  | 'facebook'
  | 'twitch'
  | 'vimeo'
  | 'linktree'
  | 'website';

export type Social = { platform: SocialPlatform; url: string };

export type Creative = {
  id: string;
  name: string;
  handle: string;
  /** Main role — drives the pin, colour and icon. */
  role: Role;
  /** Anything else they also do, e.g. a producer who also engineers. */
  alsoRoles: Role[];
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  city: string;
  /**
   * Where the pin goes. Studios with an address and anyone who opted in (`exactLocation`)
   * are shown at the exact spot; for everyone else this is just their city's centre.
   */
  coords: [lng: number, lat: number];
  /** They chose to show a precise spot instead of just their city. */
  exactLocation?: boolean;
  /** Studios only: street address shown on the profile. */
  address?: string;
  /** Anyone who's a producer, videographer or engineer: how far they'll travel to a session, in miles. */
  travelMiles?: number;
  bio: string;
  /** Rate for the main role. */
  rate: string;
  /** Rates for any extra roles, e.g. a producer who also mixes. */
  roleRates?: Partial<Record<Role, string>>;
  rating: number;
  reviews: number;
  /** Genre ids from data/genres.ts. */
  genres: string[];
  available: boolean;
  work: string[];
  socials: Social[];
  /** Uploaded profile picture / banner, stored with the other files (see data/attachments.ts). */
  avatarId?: string;
  bannerId?: string;
  /** A photo/video post pinned to the top of the profile. */
  featuredPostId?: string;
};

export type PostKind = 'collab' | 'promo' | 'question';

export type Comment = { id: string; authorId: string; text: string; at: number };

export type Post = {
  id: string;
  authorId: string;
  kind: PostKind;
  text: string;
  at: number;
  likes: string[];
  comments: Comment[];
  attachments?: Attachment[];
};

export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';

/** A file sent in a message. The bytes are stored separately (see data/attachments.ts). */
export type Attachment = { id: string; name: string; type: string; size: number; kind: AttachmentKind };

export type Message = { id: string; from: string; text: string; at: number; attachments?: Attachment[] };

export type Conversation = {
  id: string;
  withId: string;
  messages: Message[];
  unread: boolean;
};
