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

/** A time frame someone is open for bookings. Times are milliseconds since 1970 (like Date.now()). */
export type Slot = { id: string; ownerId: string; start: number; end: number; note: string; booked: boolean };

/** Booking times as sent in a message: a copy, so the message reads the same if the time changes later. */
export type SharedSlot = { id: string; start: number; end: number; note: string };

export type ServiceType = 'studio_session' | 'music_video' | 'production' | 'mixing' | 'recording' | 'performance' | 'session';

/** A booking: a client asked for one of a provider's times; the provider accepts or declines. */
export type Booking = {
  id: string;
  providerId: string;
  clientId: string;
  slotId: string | null;
  service: ServiceType;
  start: number;
  end: number;
  note: string;
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled';
  cancelledBy: string | null;
  createdAt: number;
};

/** Something we told you about: booking news and reminders (shown in the Bookings tab). */
export type Notice = {
  id: string;
  kind:
    | 'booking_request'
    | 'booking_confirmed'
    | 'booking_declined'
    | 'booking_cancelled'
    | 'reminder'
    | 'message'
    | 'review_request'
    | 'review';
  title: string;
  body: string;
  url: string;
  actorId: string | null;
  bookingId: string | null;
  read: boolean;
  at: number;
};

/** A client's rating of a session with a provider. */
export type Review = {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  service: ServiceType;
  rating: number;
  comment: string;
  at: number;
};

/** What you want push notifications for (saved with your account). */
export type NotificationPrefs = { messages: boolean; bookings: boolean; reminders: boolean };

export type Message = { id: string; from: string; text: string; at: number; attachments?: Attachment[]; slots?: SharedSlot[] };

export type Conversation = {
  id: string;
  withId: string;
  messages: Message[];
  unread: boolean;
};
