import {
  siApplemusic,
  siAudiomack,
  siBandcamp,
  siBeatstars,
  siFacebook,
  siInstagram,
  siLinktree,
  siSoundcloud,
  siSpotify,
  siThreads,
  siTiktok,
  siTwitch,
  siVimeo,
  siX,
  siYoutube,
} from 'simple-icons';
import type { SocialPlatform } from './types';

type PlatformInfo = {
  id: SocialPlatform;
  label: string;
  /** SVG path on a 24×24 grid; null means use the generic link icon. */
  path: string | null;
  color: string;
  /** Turns a bare handle like "@name" into a full profile URL. */
  fromHandle?: (handle: string) => string;
};

const p = (
  id: SocialPlatform,
  label: string,
  icon: { path: string; hex: string } | null,
  fromHandle?: (h: string) => string,
): PlatformInfo => ({ id, label, path: icon?.path ?? null, color: icon ? `#${icon.hex}` : '#3f5a44', fromHandle });

export const PLATFORMS: PlatformInfo[] = [
  p('instagram', 'Instagram', siInstagram, (h) => `https://instagram.com/${h}`),
  p('tiktok', 'TikTok', siTiktok, (h) => `https://tiktok.com/@${h}`),
  p('youtube', 'YouTube', siYoutube, (h) => `https://youtube.com/@${h}`),
  p('spotify', 'Spotify', siSpotify),
  p('applemusic', 'Apple Music', siApplemusic),
  p('soundcloud', 'SoundCloud', siSoundcloud, (h) => `https://soundcloud.com/${h}`),
  p('audiomack', 'Audiomack', siAudiomack, (h) => `https://audiomack.com/${h}`),
  p('beatstars', 'BeatStars', siBeatstars, (h) => `https://beatstars.com/${h}`),
  p('bandcamp', 'Bandcamp', siBandcamp, (h) => `https://${h}.bandcamp.com`),
  p('x', 'X', siX, (h) => `https://x.com/${h}`),
  p('threads', 'Threads', siThreads, (h) => `https://threads.net/@${h}`),
  p('facebook', 'Facebook', siFacebook, (h) => `https://facebook.com/${h}`),
  p('twitch', 'Twitch', siTwitch, (h) => `https://twitch.tv/${h}`),
  p('vimeo', 'Vimeo', siVimeo, (h) => `https://vimeo.com/${h}`),
  p('linktree', 'Linktree', siLinktree, (h) => `https://linktr.ee/${h}`),
  p('website', 'Website', null),
];

export const platformInfo = (id: SocialPlatform) => PLATFORMS.find((x) => x.id === id)!;

/**
 * Turns what someone typed into a safe, absolute http(s) link, or null.
 * Accepts full URLs, bare domains ("mysite.com") and handles ("@name") for platforms that support them.
 */
export function normalizeSocialUrl(platform: SocialPlatform, input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const info = platformInfo(platform);
  const handle = raw.replace(/^@/, '');
  let candidate = raw;
  if (info.fromHandle && /^@?[\w.-]+$/.test(raw) && !raw.includes('.')) candidate = info.fromHandle(handle);
  else if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) candidate = `https://${raw}`;
  try {
    const url = new URL(candidate);
    // Only web links — never javascript:, data:, etc.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Short label for a link, e.g. "instagram.com/kayawells". */
export function displayUrl(url: string) {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '');
  } catch {
    return url;
  }
}
