import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { Booking, Notice } from '../data/types';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { SignInPrompt } from '../components/SignInPrompt';
import { NotifyCard } from '../components/Notify';
import { BookingEditor, SERVICE_LABEL, formatDay, formatTimes } from '../components/Booking';
import { timeAgo } from '../components/time';
import { ReviewModal, Stars } from '../components/Reviews';

/** Booking requests to answer, what's coming up, and the notifications about them. */
export function BookingsPage() {
  const { signedIn } = useStore();
  if (!signedIn)
    return <SignInPrompt icon="calendar" title="Bookings" text="Sign in to book sessions, answer requests and get reminders." />;
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
        <h1>Bookings</h1>
        <button className="btn" onClick={() => setEditing(true)}>
          <Icon name="calendar" size={16} /> Your booking times
        </button>
      </header>

      <NotifyCard why="Hear about booking requests and confirmations straight away, and get reminders before every session." />

      {requests.length > 0 && (
        <Section title="Requests for you" count={requests.length}>
          {requests.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title="Waiting for an answer">
          {waiting.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past sessions">
          {past.map((b) => (
            <PastCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {nothing && (
        <div className="card bookings-empty">
          <Icon name="calendar" size={28} />
          <p>
            <strong>No bookings yet.</strong> To book someone, open their profile and tap <b>Booking times</b>. To get booked, add your
            own times.
          </p>
          <div className="bookings-empty-actions">
            <Link className="btn" to="/">
              Find people on the map
            </Link>
            <button className="btn primary" onClick={() => setEditing(true)}>
              Add your booking times
            </button>
          </div>
        </div>
      )}

      <Section title="Notifications">
        {notices.length === 0 ? (
          <p className="muted small bookings-quiet">Booking requests, confirmations and reminders will show up here.</p>
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
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
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
          <strong>{SERVICE_LABEL[b.service]}</strong>
          <span className="muted small">
            {providing ? 'Booked by' : 'With'}{' '}
            <Link to={`/u/${other.id}`} className="strong">
              {other.name}
            </Link>
          </span>
        </div>
        <span className={`booking-status is-${b.status}`}>{STATUS[b.status]}</span>
      </div>
      <div className="booking-card-when">
        <Icon name="calendar" size={16} />
        <span>
          {formatDay(b.start)} · {formatTimes(b)}
        </span>
      </div>
      {b.note && <p className="booking-card-note">“{b.note}”</p>}
      {error && <p className="field-note is-bad">{error}</p>}

      <div className="booking-card-actions">
        <Link className="btn" to={`/messages/${other.id}`}>
          <Icon name="chat" size={16} /> Message
        </Link>
        {confirming ? (
          <>
            <span className="muted small">{b.status === 'pending' && !providing ? 'Cancel this request?' : 'Cancel this booking?'}</span>
            <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>
              Keep
            </button>
            <button className="btn danger" onClick={() => run(() => cancelBooking(b.id))} disabled={busy}>
              Cancel it
            </button>
          </>
        ) : b.status === 'pending' && providing ? (
          <>
            <button className="btn" onClick={() => run(() => respondBooking(b.id, false))} disabled={busy}>
              Decline
            </button>
            <button className="btn primary" onClick={() => run(() => respondBooking(b.id, true))} disabled={busy}>
              Accept
            </button>
          </>
        ) : (
          <button className="btn danger-outline" onClick={() => setConfirming(true)} disabled={busy}>
            {b.status === 'pending' ? 'Cancel request' : 'Cancel'}
          </button>
        )}
      </div>
    </article>
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
          <strong>{SERVICE_LABEL[b.service]}</strong>
          <span className="muted small">
            {client ? 'With' : 'Booked by'} {other.name} · {formatDay(b.start)}
          </span>
        </div>
        {client &&
          (review ? (
            <button className="past-review" onClick={() => setReviewing(true)} aria-label="Edit your review">
              <Stars value={review.rating} size={13} />
              <span className="muted small">Edit</span>
            </button>
          ) : (
            <button className="btn primary" onClick={() => setReviewing(true)}>
              <Icon name="star" size={15} /> Leave a review
            </button>
          ))}
      </div>
      {reviewing && <ReviewModal booking={b} provider={other} onClose={() => setReviewing(false)} />}
    </article>
  );
}

const NOTICE_ICON: Record<Notice['kind'], IconName> = {
  review_request: 'star',
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
