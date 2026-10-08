import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../store';
import { Icon, type IconName } from './Icon';
import { LogoMark } from './LogoMark';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Map', icon: 'map' },
  { to: '/feed', label: 'Community', icon: 'feed' },
  { to: '/messages', label: 'Messages', icon: 'chat' },
  { to: '/me', label: 'Profile', icon: 'user' },
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
  const { unreadCount, signedIn } = useStore();
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <Logo />
        <div className="nav-links">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
              <span className="nav-icon">
                <Icon name={n.icon} size={22} />
                {n.to === '/messages' && unreadCount > 0 && <b className="nav-badge">{unreadCount}</b>}
              </span>
              {/* Guests see "Sign in" where Profile would be; the page explains why. */}
              <span className="nav-label">{n.to === '/me' && !signedIn ? 'Sign in' : n.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
