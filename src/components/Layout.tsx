import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Icon, type IconName } from './Icon';
import { LogoMark } from './LogoMark';
import { Avatar } from './Avatar';
import { Onboarding } from './Onboarding';
import { t } from '../i18n';
import { SuspendedNotice } from '../pages/AdminPage';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Map', icon: 'map' },
  { to: '/feed', label: 'Community', icon: 'feed' },
  { to: '/messages', label: 'Messages', icon: 'chat' },
  { to: '/bookings', label: 'Bookings', icon: 'calendar' },
  { to: '/me', label: 'Profile', icon: 'user' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Logo() {
  return (
    <span className="logo">
      <LogoMark size={40} />
      <span className="logo-name">Music Match</span>
    </span>
  );
}

export function Layout() {
  const { unreadCount, unreadNotices, signedIn } = useStore();
  const navigate = useNavigate();
  const badges: Record<string, number> = { '/messages': unreadCount, '/bookings': unreadNotices };

  // Tapping a notification opens its page: from the service worker (browsers) or the app shell.
  useEffect(() => {
    const go = (url: unknown) => typeof url === 'string' && url.startsWith('/') && navigate(url);
    const fromWorker = (e: MessageEvent) => e.data?.type === 'open' && go(e.data.url);
    const fromApp = (e: Event) => go((e as CustomEvent<string>).detail);
    navigator.serviceWorker?.addEventListener('message', fromWorker);
    window.addEventListener('mm-open', fromApp);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', fromWorker);
      window.removeEventListener('mm-open', fromApp);
    };
  }, [navigate]);

  return (
    <div className="shell">
      <nav className="nav" aria-label={t('Main')}>
        <Logo />
        <div className="nav-links">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={`nav-link${n.to === '/me' ? ' is-profile' : n.to === '/settings' ? ' is-settings' : ''}`}>
              <span className="nav-icon">
                <Icon name={n.icon} size={22} />
                {badges[n.to] > 0 && <b className="nav-badge">{badges[n.to]}</b>}
              </span>
              {/* Guests see "Sign in" where Profile would be; the page explains why. */}
              <span className="nav-label">{t(n.to === '/me' && !signedIn ? 'Sign in' : n.label)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="main">
        <SuspendedNotice />
        <Outlet />
      </main>
      <InAppBanner />
      <Onboarding />
    </div>
  );
}

/** A short banner at the top for a new message or booking update while you're in the app. */
function InAppBanner() {
  const { banner, dismissBanner, person } = useStore();
  const navigate = useNavigate();
  if (!banner) return null;
  const who = banner.actorId ? person(banner.actorId) : null;
  return (
    <div className="inapp-banner" role="status" key={banner.id}>
      <button
        className="inapp-banner-main"
        onClick={() => {
          dismissBanner();
          navigate(banner.url);
        }}
      >
        {who ? <Avatar person={who} size={36} /> : <Icon name="bell" size={20} />}
        <span className="inapp-banner-text">
          <strong>{banner.title || who?.name}</strong>
          <span>{banner.body}</span>
        </span>
      </button>
      <button className="icon-btn ghost" onClick={dismissBanner} aria-label={t('Dismiss')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
