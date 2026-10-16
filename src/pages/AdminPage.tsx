import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import * as api from '../backend/api';
import type { AdminReport } from '../backend/api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { reasonLabel } from '../components/Safety';
import { timeAgo } from '../components/time';
import { locale, plural, t } from '../i18n';

// Moderation, for admins only: reports to look at, what was reported, and one-tap actions.
// Apple expects reports on user content to be acted on within 24 hours.

type Tab = 'open' | 'closed' | 'suspended';

const DAY = 86_400_000;
const untilText = (until: number | null) =>
  until ? t('until {date}', { date: new Date(until).toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' }) }) : t('for good');

/** The action taken, as the database records it, in the current language. */
const actionLabel = (action: string) => {
  const days = /^Suspended for (\d+) days$/.exec(action);
  if (days) return t('Suspended for {n} days', { n: days[1] });
  const removed = /^Removed the (\w+)$/.exec(action);
  if (removed) return t('Removed the {thing}', { thing: t(removed[1]) });
  return t(action);
};

export function AdminPage() {
  const { isAdmin, live } = useStore();
  if (!live || !isAdmin)
    return (
      <div className="page">
        <p className="empty">{t('This page is only for Music Match admins.')}</p>
      </div>
    );
  return <Moderation />;
}

function Moderation() {
  const [tab, setTab] = useState<Tab>('open');
  const [open, setOpen] = useState<AdminReport[] | null>(null);
  const [closed, setClosed] = useState<AdminReport[] | null>(null);
  const [suspended, setSuspended] = useState<Awaited<ReturnType<typeof api.adminSuspensions>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.adminReports(true), api.adminReports(false), api.adminSuspensions()]).then(
      ([o, c, s]) => {
        setOpen(o);
        setClosed(c);
        setSuspended(s);
      },
      (e) => setError(e instanceof Error ? t(e.message) : t('Couldn’t load reports.')),
    );
  }, []);
  useEffect(load, [load]);

  const late = open?.filter((r) => Date.now() - r.at > 12 * 60 * 60 * 1000).length ?? 0;

  return (
    <div className="page admin">
      <header className="page-head admin-head">
        <h1>{t('Moderation')}</h1>
        <button className="btn" onClick={load}>
          {t('Refresh')}
        </button>
      </header>
      <p className="muted admin-lead">
        {t('Act on reports within 24 hours. Removing content or suspending someone tells the people who reported it that action was taken; dismissing doesn’t tell anyone.')}
      </p>
      {late > 0 && (
        <p className="admin-late">
          <Icon name="warning" size={16} /> {plural(late, '{n} report has been waiting over 12 hours.', '{n} reports have been waiting over 12 hours.')}
        </p>
      )}

      <div className="segmented admin-tabs" role="tablist">
        {(
          [
            ['open', `${t('Open reports')}${open?.length ? ` (${open.length})` : ''}`],
            ['closed', t('Closed')],
            ['suspended', `${t('Suspended')}${suspended?.length ? ` (${suspended.length})` : ''}`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="field-note is-bad">{error}</p>}

      {tab === 'open' &&
        (open === null ? (
          <p className="muted">{t('Loading…')}</p>
        ) : open.length === 0 ? (
          <p className="empty">{t('Nothing to review.')} 🎉</p>
        ) : (
          <div className="admin-list">
            {open.map((r) => (
              <ReportCard key={r.id} report={r} onDone={load} />
            ))}
          </div>
        ))}

      {tab === 'closed' &&
        (closed === null ? (
          <p className="muted">{t('Loading…')}</p>
        ) : closed.length === 0 ? (
          <p className="empty">{t('No closed reports yet.')}</p>
        ) : (
          <div className="admin-list">
            {closed.map((r) => (
              <ReportCard key={r.id} report={r} onDone={load} />
            ))}
          </div>
        ))}

      {tab === 'suspended' &&
        (suspended === null ? (
          <p className="muted">{t('Loading…')}</p>
        ) : suspended.length === 0 ? (
          <p className="empty">{t('No suspended accounts.')}</p>
        ) : (
          <div className="admin-list">
            {suspended.map((s) => (
              <SuspendedRow key={s.userId} userId={s.userId} until={s.until} reason={s.reason} onDone={load} />
            ))}
          </div>
        ))}
    </div>
  );
}

function ReportCard({ report: r, onDone }: { report: AdminReport; onDone: () => void }) {
  const { person } = useStore();
  const reporter = person(r.reporterId);
  const reported = r.reportedUserId ? person(r.reportedUserId) : null;
  const [busy, setBusy] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState(reasonLabel(r.reason));
  const [error, setError] = useState<string | null>(null);
  const isOpen = r.status === 'open';
  const age = Date.now() - r.at;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Something went wrong. Try again.'));
      setBusy(false);
    }
  };

  return (
    <article className={`card admin-report${isOpen && age > 12 * 60 * 60 * 1000 ? ' is-late' : ''}`}>
      <div className="admin-report-top">
        <span className="admin-reason">
          <Icon name="flag" size={14} /> {reasonLabel(r.reason)}
        </span>
        <span className="muted small">
          {t(r.targetType)} · {timeAgo(r.at)}
          {r.timesReported > 1 && <b className="admin-times"> · {t('reported {n}×', { n: r.timesReported })}</b>}
        </span>
      </div>

      {reported && (
        <Link to={`/u/${reported.id}`} className="admin-who">
          <Avatar person={reported} size={36} />
          <span>
            <strong>{reported.name}</strong>
            <span className="muted small">{r.suspended ? t('Suspended') : `@${reported.handle}`}</span>
          </span>
        </Link>
      )}

      <blockquote className="admin-content">
        {r.content === null ? (
          <span className="muted">{t('Already deleted.')}</span>
        ) : (
          <>
            {r.content.rating ? `${'★'.repeat(r.content.rating)} ` : ''}
            {r.content.text || <span className="muted">{t('(no text)')}</span>}
            {r.content.files ? <span className="muted small"> · {plural(r.content.files, '{n} file', '{n} files')}</span> : null}
          </>
        )}
      </blockquote>

      {r.details && (
        <p className="small">
          <span className="muted">{t('{name} says:', { name: reporter.name })}</span> “{r.details}”
        </p>
      )}
      {!r.details && <p className="small muted">{t('Reported by {name}', { name: reporter.name })}</p>}

      {error && <p className="field-note is-bad">{error}</p>}

      {!isOpen ? (
        <p className="small admin-done">
          <Icon name={r.status === 'dismissed' ? 'close' : 'flag'} size={13} /> {r.action ? actionLabel(r.action) : t(r.status)}
          {r.resolvedAt && <span className="muted"> · {timeAgo(r.resolvedAt)}</span>}
        </p>
      ) : suspending && reported ? (
        <div className="admin-suspend">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t('Reason (they’ll see this)')} aria-label={t('Reason')} />
          <div className="admin-actions">
            <button className="btn" onClick={() => setSuspending(false)} disabled={busy}>
              {t('Back')}
            </button>
            {[7, 30].map((d) => (
              <button key={d} className="btn danger-outline" onClick={() => run(() => api.adminSuspend(reported.id, d, reason))} disabled={busy}>
                {t('{n} days', { n: d })}
              </button>
            ))}
            <button className="btn danger" onClick={() => run(() => api.adminSuspend(reported.id, null, reason))} disabled={busy}>
              {t('For good')}
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-actions">
          <button className="btn" onClick={() => run(() => api.adminDismiss(r.id))} disabled={busy}>
            {t('Dismiss report')}
          </button>
          {r.targetType !== 'profile' && r.content !== null && (
            <button className="btn danger-outline" onClick={() => run(() => api.adminRemove(r.id))} disabled={busy}>
              <Icon name="trash" size={15} /> {t('Remove {thing}', { thing: t(r.targetType) })}
            </button>
          )}
          {reported && !r.suspended && (
            <button className="btn danger" onClick={() => setSuspending(true)} disabled={busy}>
              <Icon name="block" size={15} /> {t('Suspend')}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function SuspendedRow({ userId, until, reason, onDone }: { userId: string; until: number | null; reason: string; onDone: () => void }) {
  const { person } = useStore();
  const who = person(userId);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card admin-suspended">
      <Avatar person={who} size={40} />
      <span className="admin-suspended-text">
        <strong>{who.name}</strong>
        <span className="muted small">
          {t('Suspended {until}', { until: untilText(until) })}
          {until && until - Date.now() < DAY && ` ${t('(ends soon)')}`}
          {reason && ` · ${reason}`}
        </span>
      </span>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.adminUnsuspend(userId);
          } finally {
            onDone();
          }
        }}
      >
        {t('Unsuspend')}
      </button>
    </div>
  );
}

/** Shown across the top when your own account is suspended. */
export function SuspendedNotice() {
  const { suspension } = useStore();
  if (!suspension) return null;
  return (
    <div className="suspended-notice" role="alert">
      <Icon name="block" size={18} />
      <span>
        <strong>{t('Your account is suspended {until}.', { until: untilText(suspension.until) })}</strong>{' '}
        {t('You can still look around, but you can’t post, message, book or review.')}
        {suspension.reason ? ' ' + t('Reason: {reason}.', { reason: suspension.reason }) : ''}{' '}
        <Link to="/terms">{t('Terms of Service')}</Link>
      </span>
    </div>
  );
}
