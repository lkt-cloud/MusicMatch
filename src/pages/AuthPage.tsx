import { useState } from 'react';
import { supabase } from '../backend/client';
import { LogoMark } from '../components/LogoMark';

/** Email + password sign in / sign up. Only shown in live mode. */
export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
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

  const resetPassword = async () => {
    if (!email) return setError('Type your email first.');
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) setError(error.message);
    else setNotice('If that email has an account, a reset link is on its way.');
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <LogoMark size={48} />
          <h1>Music Match</h1>
        </div>
        <p className="auth-sub">
          {mode === 'signin' ? 'Sign in to find creatives near you.' : 'Create your account. It takes a minute.'}
        </p>

        {mode === 'signup' && (
          <label>
            <span>Name or artist name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
          </label>
        )}
        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </label>

        {error && <p className="field-note is-bad">{error}</p>}
        {notice && <p className="field-note is-good">{notice}</p>}

        <button className="btn primary block" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

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
