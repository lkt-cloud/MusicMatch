import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { Booking, Notice } from '../data/types';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { SignInPrompt } from '../components/SignInPrompt';
import { NotifyCard } from '../components/Notify';
import { BookingEditor, directionsUrl, serviceName, formatDay, formatTimes, googleCalendarUrl } from '../components/Booking';
import { calendarFileUrl } from '../backend/api';
import { timeAgo } from '../components/time';
import { ReviewModal, Stars } from '../components/Reviews';
import { t } from '../i18n';

/** Booking requests to answer, what's coming up, and the notifications about them. */
export function BookingsPage() {
  const { signedIn } = useStore();
  if (!signedIn)
    return <SignInPrompt icon="calendar" title={t('Bookings')} text={t('Sign in to book sessions, answer requests and get reminders.')} />;
  return <BookingsContent />;
}

function BookingsContent() {
  const { meId, bookings, notices, markNoticesRead } = useStore();
  const [editing, setEditing] = useState(false);
  // Unread ones stay highlighted while you're on the page, even though they're marked read.
  const unreadAtOpen = useRef(new Set(notices.filter((n) => !n.read).map((n) => n.id)));
  useEffect(() => {
    notices.forEach((n) => !n.read && unreadAtOpen.current.add(n.id));
    markNoticesRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notices.length]);

  const now = Date.now();
  const requests = bookings.filter((b) => b.status === 'pending' && b.providerId === meId && b.start > now);
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && b.end > now);
  const waiting = bookings.filter((b) => b.status === 'pending' && b.clientId === meId && b.start > now);
  // Sessions that happened in the last 60 days (the window for reviewing them), newest first.
  const past = bookings
    .filter((b) => b.status === 'confirmed' && b.end <= now && b.end > now - 60 * 86_400_000)
    .sort((a, b) => b.start - a.start);
  const nothing = !requests.length && !upcoming.length && !waiting.length && !past.length;

  return (
    <div className="page bookings">
      <header className="page-head bookings-head">
        <h1>{t('Bookings')}</h1>
        <button className="btn" onClick={() => setEditing(true)}>
          <Icon name="calendar" size={16} /> {t('Your booking times')}
        </button>
      </header>

      <NotifyCard why={t('Hear about booking requests and confirmations straight away, and get reminders before every session.')} />

      {requests.length > 0 && (
        <Section title={t('Requests for you')} count={requests.length}>
          {requests.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title={t('Upcoming')}>
          {upcoming.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title={t('Waiting for an answer')}>
          {waiting.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section title={t('Past sessions')}>
          {past.map((b) => (
            <PastCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {nothing && (
        <div className="card bookings-empty">
          <Icon name="calendar" size={28} />
          <p>
            <strong>{t('No bookings yet.')}</strong>{' '}
            {t('To book someone, open their profile and tap Booking times. To get booked, add your own times.')}
          </p>
          <div className="bookings-empty-actions">
            <Link className="btn" to="/">
              {t('Find people on the map')}
            </Link>
            <button className="btn primary" onClick={() => setEditing(true)}>
              {t('Add your booking times')}
            </button>
          </div>
        </div>
      )}

      <Section title={t('Notifications')}>
        {notices.length === 0 ? (
          <p className="muted small bookings-quiet">{t('Booking requests, confirmations and reminders will show up here.')}</p>
        ) : (
          <ul className="notice-list">
            {notices.map((n) => (
              <NoticeRow key={n.id} notice={n} fresh={unreadAtOpen.current.has(n.id)} />
            ))}
          </ul>
        )}
      </Section>

      {editing && <BookingEditor onClose={() => setEditing(false)} />}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="bookings-section">
      <h2>
        {title}
        {count ? <span className="count">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

const STATUS: Record<Booking['status'], string> = {
  pending: 'Waiting',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

function BookingCard({ booking: b }: { booking: Booking }) {
  const { meId, person, respondBooking, cancelBooking } = useStore();
  const providing = b.providerId === meId;
  const other = person(providing ? b.clientId : b.providerId);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <article className={`card booking-card is-${b.status}`}>
      <div className="booking-card-top">
        <Link to={`/u/${other.id}`}>
          <Avatar person={other} size={44} />
        </Link>
        <div className="booking-card-who">
          <strong>{serviceName(b.service)}</strong>
          <span className="muted small">
            {providing ? t('Booked by') : t('With')}{' '}
            <Link to={`/u/${other.id}`} className="strong">
              {other.name}
            </Link>
          </span>
        </div>
        <span className={`booking-status is-${b.status}`}>{t(STATUS[b.status])}</span>
      </div>
      <div className="booking-card-when">
        <Icon name="calendar" size={16} />
        <span>
          {formatDay(b.start)} · {formatTimes(b)}
        </span>
      </div>
      <PlaceRow booking={b} />
      {b.note && <p className="booking-card-note">“{b.note}”</p>}
      {error && <p className="field-note is-bad">{error}</p>}
      {b.status === 'confirmed' && <AddToCalendar booking={b} />}

      <div className="booking-card-actions">
        <Link className="btn" to={`/messages/${other.id}`}>
          <Icon name="chat" size={16} /> {t('Message')}
        </Link>
        {confirming ? (
          <>
            <span className="muted small">{b.status === 'pending' && !providing ? t('Cancel this request?') : t('Cancel this booking?')}</span>
            <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>
              {t('Keep')}
            </button>
            <button className="btn danger" onClick={() => run(() => cancelBooking(b.id))} disabled={busy}>
              {t('Cancel it')}
            </button>
          </>
        ) : b.status === 'pending' && providing ? (
          <>
            <button className="btn" onClick={() => run(() => respondBooking(b.id, false))} disabled={busy}>
              {t('Decline')}
            </button>
            <button className="btn primary" onClick={() => run(() => respondBooking(b.id, true))} disabled={busy}>
              {t('Accept')}
            </button>
          </>
        ) : (
          <button className="btn danger-outline" onClick={() => setConfirming(true)} disabled={busy}>
            {b.status === 'pending' ? t('Cancel request') : t('Cancel')}
          </button>
        )}
      </div>
    </article>
  );
}

/** Where it happens, with directions; either person can set or change it before the session. */
function PlaceRow({ booking: b }: { booking: Booking }) {
  const { setBookingPlace } = useStore();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(b.place);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = (b.status === 'pending' || b.status === 'confirmed') && b.end > Date.now();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setBookingPlace(b.id, text.trim());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Couldn’t save that. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (editing)
    return (
      <div className="booking-place-edit">
        <input
          className="booking-note"
          value={text}
          maxLength={200}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={t('Studio, venue or address')}
          aria-label={t('Where?')}
        />
        <button className="btn" onClick={() => setEditing(false)} disabled={busy}>
          {t('Cancel')}
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {t('Save')}
        </button>
        {error && <p className="field-note is-bad">{error}</p>}
      </div>
    );

  return (
    <div className="booking-place">
      <Icon name="pin" size={16} />
      {b.place ? (
        <>
          <span className="booking-place-text">{b.place}</span>
          <a className="link" href={directionsUrl(b.place, b.placeCoords)} target="_blank" rel="noopener">
            {t('Directions')}
          </a>
        </>
      ) : (
        <span className="muted">{t('No place set yet')}</span>
      )}
      {canEdit && (
        <button
          className="link muted-link"
          onClick={() => {
            setText(b.place);
            setEditing(true);
          }}
        >
          {b.place ? t('Change') : t('Add place')}
        </button>
      )}
    </div>
  );
}

/** Saves the session to Apple Calendar / Outlook (a calendar file) or Google Calendar. */
function AddToCalendar({ booking: b }: { booking: Booking }) {
  const { person, live } = useStore();
  const [open, setOpen] = useState(false);
  const provider = person(b.providerId);
  const client = person(b.clientId);
  return (
    <div className="add-calendar">
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="calendar" size={16} /> {t('Add to calendar')}
      </button>
      {open && (
        <div className="add-calendar-options">
          {live && b.calendarToken && (
            <a className="btn" href={calendarFileUrl(b)} onClick={() => setOpen(false)}>
              {t('Apple Calendar / Outlook')}
            </a>
          )}
          <a className="btn" href={googleCalendarUrl(b, provider, client)} target="_blank" rel="noopener" onClick={() => setOpen(false)}>
            {t('Google Calendar')}
          </a>
        </div>
      )}
    </div>
  );
}

/** A session that's over: the client can rate it. */
function PastCard({ booking: b }: { booking: Booking }) {
  const { meId, person, myReviewFor } = useStore();
  const [reviewing, setReviewing] = useState(false);
  const client = b.clientId === meId;
  const other = person(client ? b.providerId : b.clientId);
  const review = client ? myReviewFor(b.id) : undefined;

  return (
    <article className="card booking-card is-past">
      <div className="booking-card-top">
        <Link to={`/u/${other.id}`}>
          <Avatar person={other} size={40} />
        </Link>
        <div className="booking-card-who">
          <strong>{serviceName(b.service)}</strong>
          <span className="muted small">
            {client ? t('With') : t('Booked by')} {other.name} · {formatDay(b.start)}
          </span>
        </div>
        {client &&
          (review ? (
            <button className="past-review" onClick={() => setReviewing(true)} aria-label={t('Edit your review')}>
              <Stars value={review.rating} size={13} />
              <span className="muted small">{t('Edit')}</span>
            </button>
          ) : (
            <button className="btn primary" onClick={() => setReviewing(true)}>
              <Icon name="star" size={15} /> {t('Leave a review')}
            </button>
          ))}
      </div>
      {reviewing && <ReviewModal booking={b} provider={other} onClose={() => setReviewing(false)} />}
    </article>
  );
}

const NOTICE_ICON: Record<Notice['kind'], IconName> = {
  review_request: 'star',
  booking_updated: 'pin',
  report: 'flag',
  report_update: 'flag',
  review: 'star',
  booking_request: 'calendar',
  booking_confirmed: 'calendar',
  booking_declined: 'close',
  booking_cancelled: 'close',
  reminder: 'bell',
  message: 'chat',
};

function NoticeRow({ notice: n, fresh }: { notice: Notice; fresh: boolean }) {
  const { person } = useStore();
  const who = n.actorId ? person(n.actorId) : null;
  return (
    <li>
      <Link to={n.url} className={`notice${fresh ? ' is-fresh' : ''}`}>
        {who ? <Avatar person={who} size={38} /> : <span className="notice-icon"><Icon name={NOTICE_ICON[n.kind]} size={18} /></span>}
        <div className="notice-text">
          <strong>{n.title}</strong>
          <span>{n.body}</span>
          <span className="muted small">{timeAgo(n.at)}</span>
        </div>
        <span className={`notice-kind kind-${n.kind}`} aria-hidden>
          <Icon name={NOTICE_ICON[n.kind]} size={14} />
        </span>
      </Link>
    </li>
  );
}
