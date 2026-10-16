import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import * as api from '../backend/api';
import type { AdminReport } from '../backend/api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { REASON_LABEL } from '../components/Safety';
import { timeAgo } from '../components/time';

// Moderation, for admins only: reports to look at, what was reported, and one-tap actions.
// Apple expects reports on user content to be acted on within 24 hours.

type Tab = 'open' | 'closed' | 'suspended';

const DAY = 86_400_000;
const untilText = (until: number | null) => (until ? `until ${new Date(until).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'for good');

export function AdminPage() {
  const { isAdmin, live } = useStore();
  if (!live || !isAdmin)
    return (
      <div className="page">
        <p className="empty">This page is only for Music Match admins.</p>
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
      (e) => setError(e instanceof Error ? e.message : 'Couldn’t load reports.'),
    );
  }, []);
  useEffect(load, [load]);

  const late = open?.filter((r) => Date.now() - r.at > 12 * 60 * 60 * 1000).length ?? 0;

  return (
    <div className="page admin">
      <header className="page-head admin-head">
        <h1>Moderation</h1>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </header>
      <p className="muted admin-lead">
        Act on reports within 24 hours. Removing content or suspending someone tells the people who reported it that action was
        taken; dismissing doesn’t tell anyone.
      </p>
      {late > 0 && (
        <p className="admin-late">
          <Icon name="warning" size={16} /> {late} {late === 1 ? 'report has' : 'reports have'} been waiting over 12 hours.
        </p>
      )}

      <div className="segmented admin-tabs" role="tablist">
        {(
          [
            ['open', `Open${open?.length ? ` (${open.length})` : ''}`],
            ['closed', 'Closed'],
            ['suspended', `Suspended${suspended?.length ? ` (${suspended.length})` : ''}`],
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
          <p className="muted">Loading…</p>
        ) : open.length === 0 ? (
          <p className="empty">Nothing to review. 🎉</p>
        ) : (
          <div className="admin-list">
            {open.map((r) => (
              <ReportCard key={r.id} report={r} onDone={load} />
            ))}
          </div>
        ))}

      {tab === 'closed' &&
        (closed === null ? (
          <p className="muted">Loading…</p>
        ) : closed.length === 0 ? (
          <p className="empty">No closed reports yet.</p>
        ) : (
          <div className="admin-list">
            {closed.map((r) => (
              <ReportCard key={r.id} report={r} onDone={load} />
            ))}
          </div>
        ))}

      {tab === 'suspended' &&
        (suspended === null ? (
          <p className="muted">Loading…</p>
        ) : suspended.length === 0 ? (
          <p className="empty">No suspended accounts.</p>
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
  const [reason, setReason] = useState(REASON_LABEL[r.reason]);
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
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <article className={`card admin-report${isOpen && age > 12 * 60 * 60 * 1000 ? ' is-late' : ''}`}>
      <div className="admin-report-top">
        <span className="admin-reason">
          <Icon name="flag" size={14} /> {REASON_LABEL[r.reason]}
        </span>
        <span className="muted small">
          {r.targetType} · {timeAgo(r.at)}
          {r.timesReported > 1 && <b className="admin-times"> · reported {r.timesReported}×</b>}
        </span>
      </div>

      {reported && (
        <Link to={`/u/${reported.id}`} className="admin-who">
          <Avatar person={reported} size={36} />
          <span>
            <strong>{reported.name}</strong>
            <span className="muted small">{r.suspended ? 'Suspended' : `@${reported.handle}`}</span>
          </span>
        </Link>
      )}

      <blockquote className="admin-content">
        {r.content === null ? (
          <span className="muted">Already deleted.</span>
        ) : (
          <>
            {r.content.rating ? `${'★'.repeat(r.content.rating)} ` : ''}
            {r.content.text || <span className="muted">(no text)</span>}
            {r.content.files ? <span className="muted small"> · {r.content.files} file{r.content.files > 1 ? 's' : ''}</span> : null}
          </>
        )}
      </blockquote>

      {r.details && (
        <p className="small">
          <span className="muted">{reporter.name} says:</span> “{r.details}”
        </p>
      )}
      {!r.details && <p className="small muted">Reported by {reporter.name}</p>}

      {error && <p className="field-note is-bad">{error}</p>}

      {!isOpen ? (
        <p className="small admin-done">
          <Icon name={r.status === 'dismissed' ? 'close' : 'flag'} size={13} /> {r.action ?? r.status}
          {r.resolvedAt && <span className="muted"> · {timeAgo(r.resolvedAt)}</span>}
        </p>
      ) : suspending && reported ? (
        <div className="admin-suspend">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason (they’ll see this)" aria-label="Reason" />
          <div className="admin-actions">
            <button className="btn" onClick={() => setSuspending(false)} disabled={busy}>
              Back
            </button>
            {[7, 30].map((d) => (
              <button key={d} className="btn danger-outline" onClick={() => run(() => api.adminSuspend(reported.id, d, reason))} disabled={busy}>
                {d} days
              </button>
            ))}
            <button className="btn danger" onClick={() => run(() => api.adminSuspend(reported.id, null, reason))} disabled={busy}>
              For good
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-actions">
          <button className="btn" onClick={() => run(() => api.adminDismiss(r.id))} disabled={busy}>
            Dismiss
          </button>
          {r.targetType !== 'profile' && r.content !== null && (
            <button className="btn danger-outline" onClick={() => run(() => api.adminRemove(r.id))} disabled={busy}>
              <Icon name="trash" size={15} /> Remove {r.targetType}
            </button>
          )}
          {reported && !r.suspended && (
            <button className="btn danger" onClick={() => setSuspending(true)} disabled={busy}>
              <Icon name="block" size={15} /> Suspend
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
          Suspended {untilText(until)}
          {until && until - Date.now() < DAY && ' (ends soon)'}
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
        Unsuspend
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
        <strong>Your account is suspended {untilText(suspension.until)}.</strong> You can still look around, but you can’t post,
        message, book or review.{suspension.reason ? ` Reason: ${suspension.reason}.` : ''} See the{' '}
        <Link to="/terms">Terms</Link>.
      </span>
    </div>
  );
}
