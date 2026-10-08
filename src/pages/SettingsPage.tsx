import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { setSetting, useSettings, type ThemeChoice, type Units } from '../settings';
import { keepSignedIn, setKeepSignedIn } from '../backend/client';
import { changeEmail, changePassword, currentEmail, deleteAccount } from '../backend/api';
import { hasRole } from '../data/roles';
import { Icon, type IconName } from '../components/Icon';
import { MapSpot } from './ProfilePage';

const VERSION = '1.0';

export function SettingsPage() {
  const { live, signedIn, requireSignIn, me, mapMode, setMapMode, signOut } = useStore();
  const settings = useSettings();
  const account = live && signedIn;

  return (
    <div className="page settings">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <Section icon="sun" title="Appearance">
        <Row label="Theme" note="Dark is the default. Match device follows your phone or computer.">
          <Segmented<ThemeChoice>
            value={settings.theme}
            onChange={(v) => setSetting('theme', v)}
            options={[
              ['dark', 'Dark'],
              ['light', 'Light'],
              ['system', 'Match device'],
            ]}
          />
        </Row>
        <Row label="Reduce motion" note="Fewer animations, and the map stops right away instead of gliding.">
          <Switch checked={settings.reduceMotion} onChange={(v) => setSetting('reduceMotion', v)} label="Reduce motion" />
        </Row>
      </Section>

      <Section icon="map" title="Map">
        <Row label="Map style" note="Which map opens first. You can switch any time on the map.">
          <Segmented
            value={mapMode}
            onChange={setMapMode}
            options={[
              ['flat', 'Flat'],
              ['globe', 'Globe'],
            ]}
          />
        </Row>
        <Row label="Distances" note="Used for distances, travel radius and filters.">
          <Segmented<Units>
            value={settings.units}
            onChange={(v) => setSetting('units', v)}
            options={[
              ['mi', 'Miles'],
              ['km', 'Kilometers'],
            ]}
          />
        </Row>
        <Row label="Find me when the map opens" note="Asks for your location and zooms to you. The locate button works either way.">
          <Switch checked={settings.locateOnOpen} onChange={(v) => setSetting('locateOnOpen', v)} label="Find me when the map opens" />
        </Row>
      </Section>

      {signedIn && (
        <Section icon="pin" title="Privacy">
          {hasRole(me, 'studio') ? (
            <Row label="Your pin on the map" note="Studios show at their address. Change it in Edit profile.">
              <Link className="btn" to="/me">
                Edit profile
              </Link>
            </Row>
          ) : (
            <div className="settings-row is-stacked">
              <MapSpot />
            </div>
          )}
        </Section>
      )}

      <Section icon="user" title="Account">
        {!live && <p className="settings-empty">This copy of Music Match runs in demo mode, so accounts are switched off.</p>}
        {live && !signedIn && (
          <div className="settings-empty">
            <p>Sign in to change your email, password and profile.</p>
            <button className="btn primary" onClick={() => requireSignIn('Sign in to manage your account.')}>
              Sign in or create an account
            </button>
          </div>
        )}
        {account && <AccountRows signOut={signOut} />}
        <Row label="Profile" note="Name, roles, rates, genres, location and links.">
          <Link className="btn" to="/me">
            {signedIn ? 'Edit profile' : 'Open'}
          </Link>
        </Row>
        <Row label="Promotions" note="Boosted posts, featured profile and studio listing.">
          <Link className="btn" to="/promotions">
            Manage
          </Link>
        </Row>
      </Section>

      <Section icon="doc" title="About">
        <Row label="Terms of Service">
          <Link className="btn" to="/terms">
            Read
          </Link>
        </Row>
        <Row label="Version">
          <span className="muted">Music Match {VERSION}</span>
        </Row>
      </Section>

      {account && <DeleteAccount />}
    </div>
  );
}

function AccountRows({ signOut }: { signOut?: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [remember, setRemember] = useState(keepSignedIn);
  const [open, setOpen] = useState<'email' | 'password' | null>(null);

  useEffect(() => {
    currentEmail().then(setEmail).catch(() => setEmail(null));
  }, []);

  return (
    <>
      <Row label="Email" note={email ?? '…'}>
        <button className="btn" onClick={() => setOpen(open === 'email' ? null : 'email')}>
          {open === 'email' ? 'Cancel' : 'Change'}
        </button>
      </Row>
      {open === 'email' && <EmailForm onDone={() => setOpen(null)} />}
      <Row label="Password">
        <button className="btn" onClick={() => setOpen(open === 'password' ? null : 'password')}>
          {open === 'password' ? 'Cancel' : 'Change'}
        </button>
      </Row>
      {open === 'password' && <PasswordForm onDone={() => setOpen(null)} />}
      <Row label="Keep me signed in" note="Off: you're signed out when you close the browser or app.">
        <Switch
          checked={remember}
          onChange={(v) => {
            setKeepSignedIn(v);
            setRemember(v);
          }}
          label="Keep me signed in"
        />
      </Row>
      {signOut && (
        <Row label="Sign out" note="Signs you out on this device.">
          <button className="btn" onClick={signOut}>
            <Icon name="signout" size={16} /> Sign out
          </button>
        </Row>
      )}
    </>
  );
}

function EmailForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'sent' | string>('idle');
  return (
    <form
      className="settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('saving');
        try {
          await changeEmail(email.trim());
          setState('sent');
        } catch (err) {
          setState(err instanceof Error ? err.message : 'Couldn’t change it. Try again.');
        }
      }}
    >
      {state === 'sent' ? (
        <p className="field-note is-good">
          Check {email} for a confirmation link. Your email changes once you click it.{' '}
          <button type="button" className="link" onClick={onDone}>
            Done
          </button>
        </p>
      ) : (
        <>
          <input type="email" name="email" autoComplete="email" placeholder="New email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="btn primary" disabled={state === 'saving'}>
            {state === 'saving' ? 'Sending…' : 'Send confirmation'}
          </button>
          {state !== 'idle' && state !== 'saving' && <p className="field-note is-bad">{state}</p>}
        </>
      )}
    </form>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle');
  const mismatch = !!confirm && confirm !== password;
  return (
    <form
      className="settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (mismatch) return;
        setState('saving');
        try {
          await changePassword(password);
          setState('saved');
          window.setTimeout(onDone, 1500);
        } catch (err) {
          setState(err instanceof Error ? err.message : 'Couldn’t change it. Try again.');
        }
      }}
    >
      {/* Lets password managers update the saved login. */}
      <input type="password" name="new-password" autoComplete="new-password" placeholder="New password (8+ characters)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
      <input type="password" name="confirm-password" autoComplete="new-password" placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      <button className="btn primary" disabled={state === 'saving' || mismatch}>
        {state === 'saving' ? 'Saving…' : 'Save password'}
      </button>
      {mismatch && <p className="field-note is-bad">The passwords don’t match.</p>}
      {state === 'saved' && <p className="field-note is-good">Password changed.</p>}
      {!['idle', 'saving', 'saved'].includes(state) && <p className="field-note is-bad">{state}</p>}
    </form>
  );
}

function DeleteAccount() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [state, setState] = useState<'idle' | 'deleting' | string>('idle');
  return (
    <section className="card settings-section is-danger">
      <h2 className="settings-title">
        <Icon name="warning" size={18} /> Delete account
      </h2>
      {!open ? (
        <Row label="Delete your account" note="Removes your profile, posts, messages and files for good.">
          <button className="btn danger-outline" onClick={() => setOpen(true)}>
            Delete…
          </button>
        </Row>
      ) : (
        <div className="settings-row is-stacked">
          <p>
            This permanently deletes your profile, posts, comments, likes, messages and uploaded files. Any running
            promotion subscriptions are cancelled first, so you won’t be charged again. Past payments aren’t refunded. This
            can’t be undone.
          </p>
          <label className="settings-confirm">
            <span>
              Type <b>DELETE</b> to confirm
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
          </label>
          <div className="settings-actions">
            <button className="btn" onClick={() => setOpen(false)} disabled={state === 'deleting'}>
              Cancel
            </button>
            <button
              className="btn danger"
              disabled={typed.trim() !== 'DELETE' || state === 'deleting'}
              onClick={async () => {
                setState('deleting');
                try {
                  await deleteAccount();
                  navigate('/', { replace: true });
                } catch (err) {
                  setState(err instanceof Error ? err.message : 'Couldn’t delete it. Try again.');
                }
              }}
            >
              {state === 'deleting' ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
          {state !== 'idle' && state !== 'deleting' && <p className="field-note is-bad">{state}</p>}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ building blocks

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="card settings-section">
      <h2 className="settings-title">
        <Icon name={icon} size={18} /> {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-text">
        <span className="settings-label">{label}</span>
        {note && <span className="settings-note">{note}</span>}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}
