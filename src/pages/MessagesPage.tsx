import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { saveFiles } from '../data/attachments';
import { KIND_ICON, PendingTray, usePendingFiles } from '../components/AttachPicker';
import type { Message } from '../data/types';
import { useStore } from '../store';
import { SignInPrompt } from '../components/SignInPrompt';
import { Avatar } from '../components/Avatar';
import { AttachmentView } from '../components/AttachmentView';
import { Icon } from '../components/Icon';
import { RoleLine } from '../components/RoleBadge';
import { timeAgo } from '../components/time';
import { ReportModal, SafetyMenu } from '../components/Safety';
import { BookingRequest, ShareSlotsModal, SlotsCard } from '../components/Booking';
import type { SharedSlot } from '../data/types';
import { t } from '../i18n';

const KIND_LABEL = { image: 'Photo', video: 'Video', audio: 'Audio', file: 'File' } as const; // shown through t()

/** One-line summary of a message for the inbox. */
function preview(m: Message) {
  if (m.text) return m.text;
  if (m.slots?.length) return t('Booking times ({n})', { n: m.slots.length });
  const files = m.attachments ?? [];
  if (files.length === 1) return files[0].kind === 'audio' || files[0].kind === 'file' ? files[0].name : t(KIND_LABEL[files[0].kind]);
  return t('{n} attachments', { n: files.length });
}

export function MessagesPage() {
  const { signedIn } = useStore();
  return signedIn ? <MessagesPageContent /> : <SignInPrompt icon="chat" title={t('Messages')} text={t('Sign in to message creatives and see your conversations.')} />;
}

function MessagesPageContent() {
  const { id } = useParams();
  const { conversations, person, meId, isOnline } = useStore();

  return (
    <div className={`messages${id ? ' has-thread' : ''}`}>
      <section className="inbox">
        <header className="page-head inbox-head">
          <h1>{t('Messages')}</h1>
        </header>
        {conversations.length === 0 && <p className="empty">No conversations yet. Find someone on the map to say hi.</p>}
        <ul className="inbox-list">
          {conversations.map((c) => {
            const who = person(c.withId);
            const last = c.messages[c.messages.length - 1];
            const lastFile = last?.attachments?.[0];
            return (
              <li key={c.id}>
                <NavLink to={`/messages/${c.withId}`} className={`inbox-item${c.unread ? ' is-unread' : ''}`}>
                  <Avatar person={who} size={46} online={isOnline(c.withId)} />
                  <span className="inbox-text">
                    <span className="inbox-top">
                      <strong>{who.name}</strong>
                      <span className="muted small">{last && timeAgo(last.at)}</span>
                    </span>
                    <span className="inbox-preview small">
                      {last?.from === meId && t('You: ')}
                      {!last?.text && lastFile && <Icon name={KIND_ICON[lastFile.kind]} size={13} />} {last ? preview(last) : t('No messages')}
                    </span>
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="thread">{id ? <Thread withId={id} key={id} /> : <EmptyThread />}</section>
    </div>
  );
}

function EmptyThread() {
  return (
    <div className="thread-empty">
      <span className="vinyl-spin"><Icon name="vinyl" size={44} /></span>
      <p>{t('Pick a conversation, or find a creative on the map to start one.')}</p>
    </div>
  );
}

function Thread({ withId }: { withId: string }) {
  const { conversations, person, meId, sendMessage, deleteMessage, deleteConversation, markRead, isOnline } = useStore();
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(false);
  const [booking, setBooking] = useState<SharedSlot | null>(null);
  const who = person(withId);
  const convo = conversations.find((c) => c.withId === withId);
  const [text, setText] = useState('');
  const online = isOnline(withId);
  const picker = usePendingFiles();
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  // On touch screens there's no hover, so tapping a message reveals its delete button.
  const [picked, setPicked] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markRead(withId);
    endRef.current?.scrollIntoView({ block: 'end' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convo?.messages.length, withId]);

  const canSend = (text.trim() || picker.pending.length) && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const attachments = picker.files.length ? await saveFiles(picker.files, { messageTo: withId }) : undefined;
      sendMessage(withId, text.trim(), attachments);
      picker.clear();
      setText('');
    } catch {
      picker.setErrors([t('Couldn’t save those files in this browser. Try smaller files or free up space.')]);
    } finally {
      setSending(false);
    }
  };

  const starters = [
    t('Hey {name}, are you available this month?', { name: who.name.split(' ')[0] }),
    t('What are your rates for a full project?'),
    t('Can I send you a track to check out?'),
  ];

  return (
    <div
      className={`thread-wrap${dragging ? ' is-dragging' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) picker.add(e.dataTransfer.files);
      }}
    >
      <header className="thread-head">
        <Link to="/messages" className="icon-btn ghost thread-back" aria-label={t('Back to messages')}>
          <Icon name="back" />
        </Link>
        <Link to={`/u/${who.id}`} className="thread-who">
          <Avatar person={who} size={38} online={online} />
          <span className="thread-who-text">
            <strong>{who.name}</strong>
            <span className="muted small">
              <span className={online ? 'status-online' : ''}>{online ? t('Online') : t('Offline')}</span> · <RoleLine person={who} /> · {who.city}
            </span>
          </span>
        </Link>
        <span className="thread-safety">
          <SafetyMenu
            target={{ userId: who.id, name: who.name, type: 'profile', id: who.id }}
            label={t('Conversation options')}
            onBlocked={() => navigate('/messages')}
            extra={
              convo
                ? [
                    { label: t('View profile'), icon: 'user', onClick: () => navigate(`/u/${who.id}`) },
                    { label: t('Delete conversation'), icon: 'trash', danger: true, onClick: () => setConfirming('conversation') },
                  ]
                : [{ label: t('View profile'), icon: 'user', onClick: () => navigate(`/u/${who.id}`) }]
            }
          />
        </span>
      </header>

      {confirming === 'conversation' && (
        <div className="confirm-bar" role="alert">
          <span>{t('Delete your whole conversation with {name}? This can’t be undone.', { name: who.name })}</span>
          <button className="btn" onClick={() => setConfirming(null)}>{t('Cancel')}</button>
          <button
            className="btn danger"
            onClick={() => {
              deleteConversation(withId);
              navigate('/messages');
            }}
          >
            {t('Delete')}
          </button>
        </div>
      )}

      <div className="thread-body">
        {!convo?.messages.length && (
          <div className="thread-intro">
            <Avatar person={who} size={64} badge />
            <h3>{who.name}</h3>
            <p className="muted small">{who.bio}</p>
            <div className="starters">
              {starters.map((s) => (
                <button key={s} className="chip" onClick={() => setText(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {convo?.messages.map((m, i) => {
          const mine = m.from === meId;
          const prev = convo.messages[i - 1];
          const gap = !prev || m.at - prev.at > 30 * 60_000;
          const files = m.attachments ?? [];
          return (
            <div key={m.id}>
              {gap && <div className="thread-time">{timeAgo(m.at)}</div>}
              <div className={`msg${mine ? ' mine' : ''}${picked === m.id ? ' is-picked' : ''}`}>
                <div className="msg-stack" onClick={() => setPicked((p) => (p === m.id ? null : m.id))}>
                  {files.length > 0 && (
                    <div className={`msg-files${files.every((f) => f.kind === 'image') && files.length > 1 ? ' is-grid' : ''}`}>
                      {files.map((f) => (
                        <AttachmentView key={f.id} file={f} />
                      ))}
                    </div>
                  )}
                  {m.slots?.length ? (
                    <SlotsCard slots={m.slots} mine={mine} from={who} onPick={setBooking} />
                  ) : null}
                  {m.text && <div className={`bubble${mine ? ' mine' : ''}`}>{m.text}</div>}
                </div>
                {!mine && (
                  <button className="msg-delete" onClick={() => setReporting(m.id)} aria-label={t('Report message')} title={t('Report message')}>
                    <Icon name="flag" size={15} />
                  </button>
                )}
                {confirming === m.id ? (
                  <span className="msg-confirm">
                    <button className="link-danger" onClick={() => { deleteMessage(withId, m.id); setConfirming(null); }}>
                      {t('Delete')}
                    </button>
                    <button onClick={() => setConfirming(null)}>{t('Cancel')}</button>
                  </span>
                ) : (
                  <button className="msg-delete" onClick={() => setConfirming(m.id)} aria-label={t('Delete message')} title={t('Delete message')}>
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {reporting && (
        <ReportModal target={{ userId: who.id, name: who.name, type: 'message', id: reporting }} onClose={() => setReporting(null)} />
      )}

      <PendingTray picker={picker} />

      <div className="thread-input">
        {picker.inputs}
        <button className="icon-btn ghost" onClick={picker.pickMedia} aria-label={t('Send photos or videos')} title={t('Photos & videos')}>
          <Icon name="image" size={20} />
        </button>
        <button className="icon-btn ghost" onClick={picker.pickFiles} aria-label={t('Send audio or files')} title={t('Audio & files (mp3, wav, mp4…)')}>
          <Icon name="clip" size={20} />
        </button>
        <button className="icon-btn ghost" onClick={() => setSharing(true)} aria-label={t('Send booking times')} title={t('Send your booking times')}>
          <Icon name="calendar" size={20} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              picker.add(e.clipboardData.files);
            }
          }}
          placeholder={picker.pending.length ? t('Add a message (optional)') : t('Message {name}', { name: who.name })}
          aria-label={t('Message')}
          autoFocus
        />
        <button className="icon-btn accent" onClick={send} disabled={!canSend} aria-label={t('Send')}>
          <Icon name="send" size={18} />
        </button>
      </div>

      {sharing && <ShareSlotsModal to={who} onClose={() => setSharing(false)} />}
      {booking && <BookingRequest provider={who} slot={booking} onClose={() => setBooking(null)} />}

      {dragging && (
        <div className="drop-hint">
          <Icon name="clip" size={28} />
          {t('Drop to attach — photos, videos, mp3, wav…')}
        </div>
      )}
    </div>
  );
}
