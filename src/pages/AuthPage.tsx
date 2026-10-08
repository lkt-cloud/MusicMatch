import { useEffect, useState } from 'react';
import { keepSignedIn, setKeepSignedIn, supabase } from '../backend/client';
import { LogoMark } from '../components/LogoMark';
import { Icon } from '../components/Icon';

/**
 * Email + password sign in / sign up (live mode only). Opens over the page when a guest
 * tries something that needs an account; `reason` says what.
 */
export function AuthPage({ reason, onClose }: { reason?: string; onClose?: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remember, setRemember] = useState(keepSignedIn);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setKeepSignedIn(remember);
    if (mode === 'signup') {
      const { data, error } = await supabase!.auth.signUp({
        email,
        password,
        options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      // With email confirmation on, there's no session until they click the link.
      else if (!data.session) setNotice('Check your email for a link to confirm your account, then sign in.');
    } else {
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    }
    setBusy(false);
  };

  // Esc closes it.
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const resetPassword = async () => {
    if (!email) return setError('Type your email first.');
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) setError(error.message);
    else setNotice('If that email has an account, a reset link is on its way.');
  };

  return (
    <div className={`auth${onClose ? ' is-modal' : ''}`} onMouseDown={(e) => onClose && e.target === e.currentTarget && onClose()}>
      {/* method/action and the autocomplete names let iPhone, Android and browser password
          managers offer to save the login and fill it in next time. */}
      <form className="auth-card" onSubmit={submit} method="post" action="#" role={onClose ? 'dialog' : undefined} aria-modal={onClose ? true : undefined} aria-label="Sign in">
        {onClose && (
          <button type="button" className="icon-btn ghost auth-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        )}
        <div className="auth-brand">
          <LogoMark size={48} />
          <h1>Music Match</h1>
        </div>
        <p className="auth-sub">
          {mode === 'signin' ? reason ?? 'Sign in to find creatives near you.' : 'Create your account. It takes a minute.'}
        </p>

        {mode === 'signup' && (
          <label>
            <span>Name or artist name</span>
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
          </label>
        )}
        <label>
          <span>Email</span>
          <input
            type="email"
            name="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            name="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </label>

        <label className="check auth-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Keep me signed in on this device</span>
        </label>

        {error && <p className="field-note is-bad">{error}</p>}
        {notice && <p className="field-note is-good">{notice}</p>}

        <button className="btn primary block" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        {mode === 'signup' && (
          <p className="auth-legal">
            By creating an account you agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener">
              Terms of Service
            </a>
            .
          </p>
        )}

        <div className="auth-links">
          {mode === 'signin' ? (
            <>
              <button type="button" className="link" onClick={() => setMode('signup')}>
                New here? Create an account
              </button>
              <button type="button" className="link muted-link" onClick={resetPassword}>
                Forgot password
              </button>
            </>
          ) : (
            <button type="button" className="link" onClick={() => setMode('signin')}>
              Already have an account? Sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
