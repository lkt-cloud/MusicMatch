import { displayUrl, platformInfo } from '../data/socials';
import type { Social, SocialPlatform } from '../data/types';
import { Icon } from './Icon';

export function PlatformIcon({ platform, size = 18 }: { platform: SocialPlatform; size?: number }) {
  const info = platformInfo(platform);
  if (!info.path) return <Icon name="link" size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={info.path} />
    </svg>
  );
}

/** Outbound links to someone's socials. `compact` shows icons only. */
export function SocialLinks({ socials, compact = false }: { socials: Social[]; compact?: boolean }) {
  if (!socials.length) return null;
  return (
    <div className={`socials${compact ? ' is-compact' : ''}`}>
      {socials.map((s) => {
        const info = platformInfo(s.platform);
        return (
          <a
            key={s.platform + s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="social"
            style={{ ['--brand' as string]: info.color }}
            title={`${info.label} — ${displayUrl(s.url)}`}
            aria-label={info.label}
          >
            <PlatformIcon platform={s.platform} size={compact ? 16 : 18} />
            {!compact && (
              <span className="social-text">
                <strong>{info.label}</strong>
                <span>{displayUrl(s.url)}</span>
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}
