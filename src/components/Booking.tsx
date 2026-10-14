import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import type { Creative, SharedSlot, Slot } from '../data/types';
import { Icon } from './Icon';

// Booking times: the time frames someone is open for sessions. They set them on their profile,
// anyone can look at them there, and they can send a few straight into a message.

const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

export const formatDay = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return `Today, ${dayFmt.format(d)}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${dayFmt.format(d)}`;
  return dayFmt.format(d);
};
export const formatTimes = (s: { start: number; end: number }) =>
  new Date(s.start).toDateString() === new Date(s.end).toDateString()
    ? timeFmt.formatRange(s.start, s.end)
    : `${timeFmt.format(s.start)} – ${timeFmt.format(s.end)} (next day)`;
export const formatSlot = (s: { start: number; end: number }) => `${dayFmt.format(s.start)} · ${formatTimes(s)}`;

/** Slots grouped by the day they start on, in order. */
function byDay<T extends { start: number }>(slots: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const s of [...slots].sort((a, b) => a.start - b.start)) {
    const key = new Date(s.start).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()].map((list) => [formatDay(list[0].start), list]);
}

const share = (s: Slot): SharedSlot => ({ id: s.id, start: s.start, end: s.end, note: s.note });

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal booking-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="cropper-head">
          <h2>{title}</h2>
          <button className="icon-btn ghost" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        {sub && <p className="promote-sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ your own times

const PRESETS: [string, string, string][] = [
  ['Morning', '10:00', '13:00'],
  ['Afternoon', '13:00', '17:00'],
  ['Evening', '18:00', '22:00'],
  ['Late night', '22:00', '02:00'],
];

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local date ("2026-10-14") + time ("13:00") as a timestamp. */
const at = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
};

/** Where you set and manage your own booking times. */
export function BookingEditor({ onClose }: { onClose: () => void }) {
  const { meId, slotsOf, addSlots, setSlotBooked, deleteSlot } = useStore();
  const mine = slotsOf(meId);
  const [date, setDate] = useState(() => toDateInput(new Date(Date.now() + 86_400_000)));
  const [from, setFrom] = useState('13:00');
  const [to, setTo] = useState('17:00');
  const [note, setNote] = useState('');
  const [weeks, setWeeks] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);

  const add = () => {
    if (!date || !from || !to) return setError('Pick a day and a start and end time.');
    const start = at(date, from);
    let end = at(date, to);
    // An end time earlier than the start means it runs past midnight (e.g. 22:00 to 02:00).
    if (end <= start) end += 86_400_000;
    if (end - start > 86_400_000) return setError('A booking time can be up to 24 hours long.');
    if (end <= Date.now()) return setError('That time has already passed.');
    const week = 7 * 86_400_000;
    // Add by calendar date, so repeating across a daylight-saving change keeps the same clock time.
    const list = Array.from({ length: weeks }, (_, i) => {
      const day = new Date(start + i * week);
      const s = at(toDateInput(day), from);
      return { start: s, end: s + (end - start), note: note.trim() };
    });
    addSlots(list);
    setError(null);
    setAdded(list.length);
  };

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(0), 2500);
    return () => window.clearTimeout(t);
  }, [added]);

  return (
    <Sheet title="Your booking times" sub="Set the times you’re open for sessions. Anyone can see them on your profile, and you can send them in messages." onClose={onClose}>
      <div className="booking-form">
        <div className="booking-presets" role="group" aria-label="Quick times">
          {PRESETS.map(([label, a, b]) => (
            <button
              key={label}
              type="button"
              className={`chip${from === a && to === b ? ' is-on' : ''}`}
              onClick={() => {
                setFrom(a);
                setTo(b);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="booking-fields">
          <label className="booking-field is-day">
            <span className="field-label">Day</span>
            <input type="date" value={date} min={toDateInput(new Date())} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="booking-field">
            <span className="field-label">From</span>
            <input type="time" value={from} step={900} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="booking-field">
            <span className="field-label">To</span>
            <input type="time" value={to} step={900} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <input
          className="booking-note"
          value={note}
          maxLength={80}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. Studio A, mixing only"
          aria-label="Note"
        />
        <div className="booking-add">
          <label className="booking-repeat">
            <span>Repeat</span>
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              <option value={1}>Just this day</option>
              <option value={2}>Weekly, 2 weeks</option>
              <option value={4}>Weekly, 4 weeks</option>
              <option value={8}>Weekly, 8 weeks</option>
            </select>
          </label>
          <button className="btn primary" onClick={add}>
            <Icon name="plus" size={16} /> Add time
          </button>
        </div>
        {error && <p className="field-note is-bad">{error}</p>}
        {added > 0 && <p className="field-note is-good">{added === 1 ? 'Added.' : `Added ${added} times.`}</p>}
      </div>

      <div className="booking-list">
        {mine === undefined ? (
          <p className="muted small">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="empty small">No booking times yet. Add your first one above.</p>
        ) : (
          byDay(mine).map(([day, list]) => (
            <div key={day} className="booking-day">
              <h3>{day}</h3>
              {list.map((s) => (
                <div key={s.id} className={`booking-row${s.booked ? ' is-booked' : ''}`}>
                  <span className="booking-time">
                    <strong>{formatTimes(s)}</strong>
                    {s.note && <small>{s.note}</small>}
                  </span>
                  <button
                    className={`chip booking-state${s.booked ? ' is-on' : ''}`}
                    onClick={() => setSlotBooked(s.id, !s.booked)}
                    aria-pressed={s.booked}
                    title={s.booked ? 'Booked: hidden from others. Tap to open it again.' : 'Tap when this time gets booked'}
                  >
                    {s.booked ? 'Booked' : 'Open'}
                  </button>
                  <button className="icon-btn ghost" onClick={() => deleteSlot(s.id)} aria-label={`Remove ${formatSlot(s)}`}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ someone else's times

/** Someone's open times, from their profile. Tapping one starts a message asking for it. */
export function BookingTimes({ person, onClose }: { person: Creative; onClose: () => void }) {
  const { slotsOf, requireSignIn } = useStore();
  const navigate = useNavigate();
  const open = slotsOf(person.id)?.filter((s) => !s.booked);
  const first = person.name.split(' ')[0];

  const request = (s: Slot) => {
    if (!requireSignIn(`Sign in to book ${first}.`)) return;
    navigate(`/messages/${person.id}?book=${encodeURIComponent(formatSlot(s))}`);
  };

  return (
    <Sheet title={`${first}’s booking times`} sub="Times are shown in your time zone. Tap one to ask for it in a message." onClose={onClose}>
      <div className="booking-list">
        {open === undefined ? (
          <p className="muted small">Loading…</p>
        ) : open.length === 0 ? (
          <p className="empty small">No open times right now. Send {first} a message to ask about availability.</p>
        ) : (
          byDay(open).map(([day, list]) => (
            <div key={day} className="booking-day">
              <h3>{day}</h3>
              {list.map((s) => (
                <button key={s.id} className="booking-row is-pick" onClick={() => request(s)}>
                  <span className="booking-time">
                    <strong>{formatTimes(s)}</strong>
                    {s.note && <small>{s.note}</small>}
                  </span>
                  <span className="booking-ask">
                    Request <Icon name="send" size={14} />
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ in messages

/** Pick some of your open times to send in a message. */
export function ShareSlotsModal({ to, onClose }: { to: Creative; onClose: () => void }) {
  const { meId, slotsOf, sendMessage } = useStore();
  const open = slotsOf(meId)?.filter((s) => !s.booked);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else if (next.size < 20) next.add(id);
      return next;
    });

  const send = () => {
    const chosen = (open ?? []).filter((s) => picked.has(s.id)).map(share);
    if (!chosen.length) return;
    sendMessage(to.id, '', undefined, chosen);
    onClose();
  };

  if (editing) return <BookingEditor onClose={() => setEditing(false)} />;

  return (
    <Sheet title="Send booking times" sub={`Pick the times to offer ${to.name}. They can tap one to book it.`} onClose={onClose}>
      <div className="booking-list">
        {open === undefined ? (
          <p className="muted small">Loading…</p>
        ) : open.length === 0 ? (
          <p className="empty small">You don’t have any open booking times yet.</p>
        ) : (
          <>
            <button className="link booking-all" onClick={() => setPicked(new Set(open.slice(0, 20).map((s) => s.id)))}>
              Select all
            </button>
            {byDay(open).map(([day, list]) => (
              <div key={day} className="booking-day">
                <h3>{day}</h3>
                {list.map((s) => (
                  <label key={s.id} className={`booking-row is-pick${picked.has(s.id) ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                    <span className="booking-time">
                      <strong>{formatTimes(s)}</strong>
                      {s.note && <small>{s.note}</small>}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="cropper-foot booking-foot">
        <button className="btn" onClick={() => setEditing(true)}>
          <Icon name="calendar" size={16} /> {open?.length ? 'Edit times' : 'Set booking times'}
        </button>
        <button className="btn primary" onClick={send} disabled={!picked.size}>
          {picked.size ? `Send ${picked.size} ${picked.size === 1 ? 'time' : 'times'}` : 'Send'}
        </button>
      </div>
    </Sheet>
  );
}

/** Booking times inside a message. The person who received them can tap one to ask for it. */
export function SlotsCard({ slots, mine, from, onPick }: { slots: SharedSlot[]; mine: boolean; from: Creative; onPick: (s: SharedSlot) => void }) {
  const now = Date.now();
  const groups = useMemo(() => byDay(slots), [slots]);
  return (
    <div className={`slots-card${mine ? ' mine' : ''}`}>
      <div className="slots-card-head">
        <Icon name="calendar" size={16} />
        <strong>{mine ? 'You sent booking times' : `${from.name.split(' ')[0]}’s open times`}</strong>
      </div>
      {groups.map(([day, list]) => (
        <div key={day} className="slots-card-day">
          <span className="slots-card-date">{day}</span>
          {list.map((s) => {
            const past = s.end <= now;
            return mine || past ? (
              <span key={s.id} className={`slots-card-slot${past ? ' is-past' : ''}`}>
                {formatTimes(s)}
                {s.note && <small> · {s.note}</small>}
              </span>
            ) : (
              <button key={s.id} className="slots-card-slot is-pick" onClick={() => onPick(s)}>
                {formatTimes(s)}
                {s.note && <small> · {s.note}</small>}
                <span className="slots-card-book">Book</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
