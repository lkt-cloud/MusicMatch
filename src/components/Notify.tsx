import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { disablePush, enablePush, pushState, type PushState } from '../push';
import { Icon } from './Icon';
import { t } from '../i18n';

/** This device's notification state, kept up to date when you come back to the page. */
export function usePushState() {
  const { live, signedIn } = useStore();
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    if (!live || !signedIn) return setState('unsupported');
    let current = true;
    const check = () => pushState().then((s) => current && setState(s));
    check();
    // Coming back from the phone's Settings app may have changed it.
    document.addEventListener('visibilitychange', check);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', check);
    };
  }, [live, signedIn]);
  return [state, setState] as const;
}

// English here; shown through t().
const HELP: Partial<Record<PushState, string>> = {
  blocked: 'Notifications are turned off for Music Match in your settings. Turn them on there, then come back.',
  install: 'On iPhone, add Music Match to your Home Screen first: tap Share, then “Add to Home Screen”. Open it from there and turn notifications on.',
  unsupported: 'This browser can’t show notifications. You’ll still see everything in the Bookings tab.',
};

/**
 * Asks to turn notifications on, explaining why first (the phone's own prompt only appears
 * after the person taps the button). Hidden once they're on.
 */
export function NotifyCard({ why, compact = false }: { why: string; compact?: boolean }) {
  const { live } = useStore();
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The demo has no notifications to send.
  if (!live || state === null || state === 'on') return null;
  // Nothing useful to offer in a small spot when it can't be turned on here.
  if (compact && state === 'unsupported') return null;

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await enablePush());
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Couldn’t turn notifications on. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`notify-card${compact ? ' is-compact' : ''}`}>
      <span className="notify-icon">
        <Icon name="bell" size={20} />
      </span>
      <div className="notify-text">
        <strong>{t('Turn on notifications')}</strong>
        <span>{HELP[state] ? t(HELP[state]!) : why}</span>
        {error && <span className="field-note is-bad">{error}</span>}
      </div>
      {state === 'off' && (
        <button className="btn primary" onClick={turnOn} disabled={busy}>
          {busy ? t('One moment…') : t('Turn on')}
        </button>
      )}
    </div>
  );
}

/** The on/off switch for this device, in Settings. */
export function DevicePush() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return <span className="muted small">Checking…</span>;
  return (
    <div className="device-push">
      {state === 'on' ? (
        <button className="btn" onClick={() => run(disablePush)} disabled={busy}>
          {t('Turn off')}
        </button>
      ) : state === 'off' ? (
        <button className="btn primary" onClick={() => run(enablePush)} disabled={busy}>
          {busy ? t('One moment…') : t('Turn on')}
        </button>
      ) : (
        <span className="muted small">{state === 'blocked' ? t('Blocked in settings') : state === 'install' ? t('Add to Home Screen first') : t('Not available here')}</span>
      )}
      {error && <span className="field-note is-bad">{error}</span>}
    </div>
  );
}

export const pushStateNote = (state: PushState | null) => (state && HELP[state] ? t(HELP[state]!) : undefined);
