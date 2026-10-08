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

const KIND_LABEL = { image: 'Photo', video: 'Video', audio: 'Audio', file: 'File' } as const;

/** One-line summary of a message for the inbox. */
function preview(m: Message) {
  if (m.text) return m.text;
  const files = m.attachments ?? [];
  if (files.length === 1) return files[0].kind === 'audio' || files[0].kind === 'file' ? files[0].name : KIND_LABEL[files[0].kind];
  return `${files.length} attachments`;
}

export function MessagesPage() {
  const { signedIn } = useStore();
  return signedIn ? <MessagesPageContent /> : <SignInPrompt icon="chat" title="Messages" text="Sign in to message creatives and see your conversations." />;
}

function MessagesPageContent() {
  const { id } = useParams();
  const { conversations, person, meId } = useStore();

  return (
    <div className={`messages${id ? ' has-thread' : ''}`}>
      <section className="inbox">
        <header className="page-head inbox-head">
          <h1>Messages</h1>
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
                  <Avatar person={who} size={46} />
                  <span className="inbox-text">
                    <span className="inbox-top">
                      <strong>{who.name}</strong>
                      <span className="muted small">{last && timeAgo(last.at)}</span>
                    </span>
                    <span className="inbox-preview small">
                      {last?.from === meId && 'You: '}
                      {!last?.text && lastFile && <Icon name={KIND_ICON[lastFile.kind]} size={13} />} {last ? preview(last) : 'No messages'}
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
      <p>Pick a conversation, or find a creative on the map to start one.</p>
    </div>
  );
}

function Thread({ withId }: { withId: string }) {
  const { conversations, person, meId, sendMessage, deleteMessage, deleteConversation, markRead } = useStore();
  const navigate = useNavigate();
  const who = person(withId);
  const convo = conversations.find((c) => c.withId === withId);
  const [text, setText] = useState('');
  const picker = usePendingFiles();
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
      picker.setErrors(['Couldn’t save those files in this browser. Try smaller files or free up space.']);
    } finally {
      setSending(false);
    }
  };

  const starters = [
    `Hey ${who.name.split(' ')[0]}, are you available this month?`,
    'What are your rates for a full project?',
    'Can I send you a track to check out?',
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
        <Link to="/messages" className="icon-btn ghost thread-back" aria-label="Back to messages">
          <Icon name="back" />
        </Link>
        <Link to={`/u/${who.id}`} className="thread-who">
          <Avatar person={who} size={38} badge />
          <span className="thread-who-text">
            <strong>{who.name}</strong>
            <span className="muted small">
              <RoleLine person={who} /> · {who.city}
            </span>
          </span>
        </Link>
        {convo && (
          <div className="thread-menu">
            <button className="icon-btn ghost" onClick={() => setMenuOpen((o) => !o)} aria-label="Conversation options" aria-expanded={menuOpen}>
              <Icon name="more" size={22} />
            </button>
            {menuOpen && (
              <div className="menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button role="menuitem" className="menu-danger" onClick={() => { setMenuOpen(false); setConfirming('conversation'); }}>
                  <Icon name="trash" size={16} /> Delete conversation
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {confirming === 'conversation' && (
        <div className="confirm-bar" role="alert">
          <span>Delete your whole conversation with {who.name}? This can’t be undone.</span>
          <button className="btn" onClick={() => setConfirming(null)}>Cancel</button>
          <button
            className="btn danger"
            onClick={() => {
              deleteConversation(withId);
              navigate('/messages');
            }}
          >
            Delete
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
              <div className={`msg${mine ? ' mine' : ''}`}>
                <div className="msg-stack">
                  {files.length > 0 && (
                    <div className={`msg-files${files.every((f) => f.kind === 'image') && files.length > 1 ? ' is-grid' : ''}`}>
                      {files.map((f) => (
                        <AttachmentView key={f.id} file={f} />
                      ))}
                    </div>
                  )}
                  {m.text && <div className={`bubble${mine ? ' mine' : ''}`}>{m.text}</div>}
                </div>
                {confirming === m.id ? (
                  <span className="msg-confirm">
                    <button className="link-danger" onClick={() => { deleteMessage(withId, m.id); setConfirming(null); }}>
                      Delete
                    </button>
                    <button onClick={() => setConfirming(null)}>Cancel</button>
                  </span>
                ) : (
                  <button className="msg-delete" onClick={() => setConfirming(m.id)} aria-label="Delete message" title="Delete message">
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <PendingTray picker={picker} />

      <div className="thread-input">
        {picker.inputs}
        <button className="icon-btn ghost" onClick={picker.pickMedia} aria-label="Send photos or videos" title="Photos & videos">
          <Icon name="image" size={20} />
        </button>
        <button className="icon-btn ghost" onClick={picker.pickFiles} aria-label="Send audio or files" title="Audio & files (mp3, wav, mp4…)">
          <Icon name="clip" size={20} />
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
          placeholder={picker.pending.length ? 'Add a message (optional)' : `Message ${who.name}`}
          aria-label="Message"
          autoFocus
        />
        <button className="icon-btn accent" onClick={send} disabled={!canSend} aria-label="Send">
          <Icon name="send" size={18} />
        </button>
      </div>

      {dragging && (
        <div className="drop-hint">
          <Icon name="clip" size={28} />
          Drop to attach — photos, videos, mp3, wav…
        </div>
      )}
    </div>
  );
}
