import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { Booking, Creative, Review } from '../data/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { SafetyMenu } from './Safety';
import { SERVICE_LABEL, formatDay } from './Booking';
import { timeAgo } from './time';

// Reviews: a client rates a session once it's over. They show on the provider's profile, and
// the average shows wherever their rating does (map, lists, profile).

const WORDS = ['', 'Poor', 'Not great', 'Good', 'Great', 'Amazing'];

/** Read-only stars, e.g. ★★★★☆. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} filled={n <= Math.round(value)} />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="star-picker">
      <div role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= shown ? 'is-on' : ''}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
          >
            <Icon name="star" size={34} filled={n <= shown} />
          </button>
        ))}
      </div>
      <span className="star-word">{shown ? WORDS[shown] : 'Tap a star'}</span>
    </div>
  );
}

/** Rate a finished session, or change the rating you gave. */
export function ReviewModal({ booking, provider, onClose }: { booking: Booking; provider: Creative; onClose: () => void }) {
  const { myReviewFor, submitReview } = useStore();
  const existing = myReviewFor(booking.id);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [state, setState] = useState<'form' | 'sending' | 'sent'>('form');
  const [error, setError] = useState<string | null>(null);
  const first = provider.name.split(' ')[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    if (!rating) return;
    setState('sending');
    setError(null);
    try {
      await submitReview(booking, rating, comment.trim());
      setState('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save that. Try again.');
      setState('form');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal review-modal" role="dialog" aria-modal="true" aria-label={`Review ${provider.name}`} onClick={(e) => e.stopPropagation()}>
        {state === 'sent' ? (
          <>
            <div className="cropper-head">
              <h2>Thanks for your review</h2>
            </div>
            <p className="promote-sub">It’s on {first}’s profile now, and helps other people find good people to work with.</p>
            <div className="cropper-foot">
              <button className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="cropper-head">
              <h2>{existing ? 'Edit your review' : `How was it with ${first}?`}</h2>
              <button className="icon-btn ghost" onClick={onClose} aria-label="Close">
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="review-about">
              <Avatar person={provider} size={44} />
              <span>
                <strong>{SERVICE_LABEL[booking.service]}</strong>
                <span className="muted small">
                  {provider.name} · {formatDay(booking.start)}
                </span>
              </span>
            </div>
            <StarPicker value={rating} onChange={setRating} />
            <textarea
              className="promote-caption"
              rows={4}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What was it like? (optional) e.g. the sound, the space, how they were to work with"
              aria-label="Your review"
            />
            <p className="field-note">Your review and name are shown on {first}’s profile.</p>
            {error && <p className="field-note is-bad">{error}</p>}
            <div className="cropper-foot">
              <button className="btn" onClick={onClose}>
                Not now
              </button>
              <button className="btn primary" onClick={send} disabled={!rating || state === 'sending'}>
                {state === 'sending' ? 'Saving…' : existing ? 'Save changes' : 'Post review'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The reviews on a profile. */
export function ReviewList({ person, mine }: { person: Creative; mine: boolean }) {
  const { reviewsOf } = useStore();
  const reviews = reviewsOf(person.id);
  const [all, setAll] = useState(false);
  const shown = all ? reviews : reviews?.slice(0, 3);

  return (
    <section id="reviews">
      <h2 className="section-title review-title">
        Reviews
        {person.reviews > 0 && (
          <span className="review-summary">
            <Stars value={person.rating} /> {person.rating.toFixed(1)} <span className="muted">({person.reviews})</span>
          </span>
        )}
      </h2>
      {reviews === undefined ? (
        <p className="muted small">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="muted small review-empty">
          {mine
            ? 'No reviews yet. People can review you after a booked session.'
            : `No reviews yet. People who book ${person.name.split(' ')[0]} through Music Match can leave one after their session.`}
        </p>
      ) : (
        <div className="reviews">
          {shown!.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
          {!all && reviews.length > 3 && (
            <button className="btn" onClick={() => setAll(true)}>
              Show all {reviews.length} reviews
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ReviewCard({ review: r }: { review: Review }) {
  const { person, meId } = useStore();
  const who = person(r.reviewerId);
  return (
    <div className="card review">
      <div className="review-head">
        <Link to={who.id === meId ? '/me' : `/u/${who.id}`}>
          <Avatar person={who} size={34} />
        </Link>
        <span className="review-who">
          <strong className="small">{who.name}</strong>
          <span className="muted small">
            {SERVICE_LABEL[r.service]} · {timeAgo(r.at)}
          </span>
        </span>
        <Stars value={r.rating} size={13} />
        {who.id !== meId && <SafetyMenu target={{ userId: who.id, name: who.name, type: 'review', id: r.id }} label="Report review" />}
      </div>
      {r.comment && <p>{r.comment}</p>}
    </div>
  );
}
