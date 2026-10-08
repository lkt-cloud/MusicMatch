import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { POST_KINDS, canPromote, kindLabel } from '../data/roles';
import { saveFiles } from '../data/attachments';
import type { Post, PostKind } from '../data/types';
import { useStore } from '../store';
import { formatRadius, milesBetween } from '../map/shared';
import { Avatar } from '../components/Avatar';
import { RoleLine } from '../components/RoleBadge';
import { CreativeRow } from '../components/CreativeRow';
import { Icon, type IconName } from '../components/Icon';
import { AttachmentView } from '../components/AttachmentView';
import { PendingTray, usePendingFiles } from '../components/AttachPicker';
import { timeAgo } from '../components/time';
import { PromoteModal } from '../components/PromoteModal';
import { PromoteOptions } from '../components/PromoteOptions';
import { splitPromoted, usePromotionFlags } from '../backend/promotions';
import { startCheckout } from '../backend/api';
import { LAUNCH_LABEL, usePricing } from '../data/pricing';

/** "Around you" covers people within this many miles. */
const NEARBY_MILES = 60;

const kindIcon = (k: PostKind) => POST_KINDS.find((x) => x.id === k)!.icon as IconName;

/** Topic name with its little icon. */
export function TopicPill({ kind }: { kind: PostKind }) {
  return (
    <span className={`kind kind-${kind}`}>
      <Icon name={kindIcon(kind)} size={13} />
      {kindLabel(kind)}
    </span>
  );
}

export function FeedPage() {
  const { me, posts, person, creatives, signedIn, located } = useStore();
  const [scope, setScope] = useState<'all' | 'near'>('all');
  const [topic, setTopic] = useState<PostKind | null>(null);
  const [promoting, setPromoting] = useState(false);

  const isNear = (authorId: string) => milesBetween(person(authorId).coords, me.coords) <= NEARBY_MILES;

  const flags = usePromotionFlags();
  const shown = useMemo(
    () =>
      [...posts]
        .filter((p) => (scope === 'all' || isNear(p.authorId)) && (!topic || p.kind === topic))
        .sort((a, b) => b.at - a.at),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts, scope, topic, me.coords],
  );
  // Up to two boosted posts lead the feed, clearly marked; the rest stay in time order.
  const { top: promotedTop, rest } = splitPromoted(shown, (p) => flags.isBoosted(p.id));
  const nearCount = posts.filter((p) => isNear(p.authorId)).length;
  const nearby = (located ? creatives.filter((c) => milesBetween(c.coords, me.coords) <= NEARBY_MILES) : creatives).slice(0, 6);

  return (
    <div className="page feed-page">
      <div className="feed-main">
        <header className="feed-head">
          <h1>Community</h1>
          {signedIn && canPromote(me) && (
            <button className="btn primary feed-promote" onClick={() => setPromoting(true)}>
              <Icon name="image" size={16} /> Promote your work
            </button>
          )}
          {located && (
            <div className="segmented" role="tablist" aria-label="Feed">
              <button role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'is-on' : ''} onClick={() => setScope('all')}>
                All
              </button>
              <button role="tab" aria-selected={scope === 'near'} className={scope === 'near' ? 'is-on' : ''} onClick={() => setScope('near')}>
                Near {me.city || 'you'} <span className="count">{nearCount}</span>
              </button>
            </div>
          )}
        </header>

        {signedIn ? <Composer /> : <GuestComposer />}

        <div className="topic-filter" role="group" aria-label="Filter by topic">
          <button className={`topic-chip${!topic ? ' is-on' : ''}`} onClick={() => setTopic(null)}>
            All topics
          </button>
          {POST_KINDS.map((k) => (
            <button
              key={k.id}
              className={`topic-chip kind-${k.id}${topic === k.id ? ' is-on' : ''}`}
              onClick={() => setTopic(topic === k.id ? null : k.id)}
              aria-pressed={topic === k.id}
            >
              <Icon name={k.icon as IconName} size={14} />
              {k.label}
            </button>
          ))}
        </div>

        <div className="posts">
          {shown.length === 0 && (
            <p className="empty">
              {scope === 'near' ? `No posts within ${formatRadius(NEARBY_MILES)} yet.` : 'No posts yet.'}
            </p>
          )}
          {promotedTop.map((p) => (
            <PostCard key={p.id} post={p} promoted />
          ))}
          {rest.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </div>

      {promoting && <PromoteModal onClose={() => setPromoting(false)} />}

      <aside className="feed-side">
        <div className="card side-card">
          <h2 className="side-title">{located ? 'Near you' : 'On Music Match'}</h2>
          {nearby.map((c) => (
            <CreativeRow key={c.id} person={c} />
          ))}
          <Link to="/" className="btn block">
            <Icon name="map" size={17} /> Open the map
          </Link>
        </div>
      </aside>
    </div>
  );
}

/** What guests see instead of the composer: one tap opens sign-in. */
function GuestComposer() {
  const { requireSignIn } = useStore();
  return (
    <button className="card guest-composer" onClick={() => requireSignIn('Sign in to post in Community.')}>
      <Icon name="edit" size={18} />
      <span>Share a collab, a release or a question…</span>
      <span className="btn primary">Sign in to post</span>
    </button>
  );
}

function Composer() {
  const PRICING = usePricing();
  const { me, addPost, live } = useStore();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<PostKind | null>(null);
  const [posting, setPosting] = useState(false);
  const [promote, setPromote] = useState(false);
  const picker = usePendingFiles();

  const ready = !!kind && (text.trim() || picker.files.length) && !posting;
  const paying = promote && live;

  const submit = async () => {
    if (!ready) return;
    setPosting(true);
    try {
      const attachments = picker.files.length ? await saveFiles(picker.files) : undefined;
      const postId = await addPost(kind!, text.trim(), attachments);
      if (paying) {
        // The post is up now; it moves to the top once Stripe confirms the payment.
        await startCheckout('boost_post', postId);
        return;
      }
      setText('');
      setKind(null);
      setPromote(false);
      picker.clear();
      setOpen(false);
    } catch (e) {
      picker.setErrors([paying && e instanceof Error ? e.message : 'Couldn’t save those files. Try smaller files.']);
    } finally {
      setPosting(false);
    }
  };

  if (!open) {
    return (
      <button className="composer card is-closed" onClick={() => setOpen(true)}>
        <Avatar person={me} size={40} />
        <span className="composer-prompt">Share a collab, a new drop, a question…</span>
        <span className="composer-quick" aria-hidden>
          <Icon name="image" size={19} />
          <Icon name="clip" size={19} />
        </span>
      </button>
    );
  }

  return (
    <div
      className="composer card"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) picker.add(e.dataTransfer.files);
      }}
    >
      <div className="composer-row">
        <Avatar person={me} size={40} />
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What’s happening? Tag a topic below so the right people see it."
          rows={3}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              picker.add(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
      </div>

      <div className="composer-topics">
        <span className="field-label">Topic</span>
        <div className="topic-filter">
          {POST_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`topic-chip kind-${k.id}${kind === k.id ? ' is-on' : ''}`}
              onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              title={k.hint}
            >
              <Icon name={k.icon as IconName} size={14} />
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <PendingTray picker={picker} />

      <label className={`promote-toggle${promote ? ' is-on' : ''}${live ? '' : ' is-disabled'}`}>
        <input type="checkbox" checked={promote} disabled={!live} onChange={(e) => setPromote(e.target.checked)} />
        <span className="promote-toggle-text">
          <strong>
            <Icon name="star" size={14} filled={promote} /> Promote this post
          </strong>
          <span>
            {live
              ? `Pinned near the top of Community, marked Promoted, for 7 days.`
              : 'Available once payments are connected (see SETUP.md).'}
          </span>
        </span>
        <span className="promote-toggle-price">
          {PRICING.boost_post.price}
          <span className="launch">{LAUNCH_LABEL}</span>
        </span>
      </label>

      <div className="composer-foot">
        {picker.inputs}
        <button type="button" className="action" onClick={picker.pickMedia}>
          <Icon name="image" size={18} /> Photo / video
        </button>
        <button type="button" className="action" onClick={picker.pickFiles}>
          <Icon name="clip" size={18} /> File
        </button>
        <span className="push" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            picker.clear();
            setOpen(false);
          }}
        >
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={submit} disabled={!ready} title={!kind ? 'Pick a topic first' : undefined}>
          {posting ? (paying ? 'Opening checkout…' : 'Posting…') : paying ? `Post & pay ${PRICING.boost_post.price}` : 'Post'}
        </button>
      </div>
      {!kind && (text.trim() || picker.files.length > 0) && <p className="field-note">Pick a topic to post.</p>}
    </div>
  );
}

function PostCard({ post, promoted = false }: { post: Post; promoted?: boolean }) {
  const { me, meId, person, toggleLike, addComment, deletePost, located, requireSignIn } = useStore();
  const navigate = useNavigate();
  const author = person(post.authorId);
  const mine = author.id === meId;
  const liked = post.likes.includes(meId);
  const [open, setOpen] = useState(post.comments.length > 0 && post.comments.length <= 2);
  const [reply, setReply] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const flags = usePromotionFlags();
  const files = post.attachments ?? [];
  const images = files.filter((f) => f.kind === 'image');
  const others = files.filter((f) => f.kind !== 'image');
  const away = mine || !located ? 0 : milesBetween(author.coords, me.coords);
  const message = () => requireSignIn(`Sign in to message ${author.name}.`) && navigate(`/messages/${author.id}`);

  const send = () => {
    if (!reply.trim() || !requireSignIn('Sign in to reply.')) return;
    addComment(post.id, reply.trim());
    setReply('');
    setOpen(true);
  };

  return (
    <article className={`card post${promoted ? ' is-promoted' : ''}`}>
      {promoted && (
        <span className="promoted-tag">
          <Icon name="star" size={12} filled /> Promoted
        </span>
      )}
      <header className="post-head">
        <Link to={mine ? '/me' : `/u/${author.id}`}>
          <Avatar person={author} size={42} badge />
        </Link>
        <div className="post-who">
          <Link to={mine ? '/me' : `/u/${author.id}`} className="strong">
            {author.name}
          </Link>
          <span className="muted small">
            <RoleLine person={author} compact /> · {author.city}
            {!located || away > NEARBY_MILES ? '' : !mine && ' · nearby'} · {timeAgo(post.at)}
          </span>
        </div>
        <TopicPill kind={post.kind} />
      </header>

      {post.text && <p className="post-text">{post.text}</p>}

      {images.length > 0 && (
        <div className={`post-images n-${Math.min(images.length, 4)}`}>
          {images.slice(0, 4).map((f) => (
            <AttachmentView key={f.id} file={f} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="post-files">
          {others.map((f) => (
            <AttachmentView key={f.id} file={f} />
          ))}
        </div>
      )}

      {post.kind === 'promo' && !mine && files.some((f) => f.kind === 'image' || f.kind === 'video') && (
        <div className="post-cta">
          <span>
            {author.name} · {author.rate}
          </span>
          <button className="btn primary" onClick={message}>
            Book {author.name.split(' ')[0]}
          </button>
        </div>
      )}

      <footer className="post-actions">
        <button className={`action${liked ? ' is-on' : ''}`} onClick={() => toggleLike(post.id)} aria-pressed={liked}>
          <Icon name="heart" size={18} filled={liked} /> {post.likes.length || ''}
        </button>
        <button className="action" onClick={() => setOpen((o) => !o)}>
          <Icon name="comment" size={18} /> {post.comments.length || ''}
        </button>
        {mine && !flags.isBoosted(post.id) && (
          <button className="action boost" onClick={() => setBoosting(true)}>
            <Icon name="star" size={16} /> Boost
          </button>
        )}
        {mine && flags.isBoosted(post.id) && <span className="action is-on">Boosted</span>}
        {mine ? (
          confirming ? (
            <span className="push msg-confirm">
              <button className="link-danger" onClick={() => deletePost(post.id)}>Delete post</button>
              <button onClick={() => setConfirming(false)}>Cancel</button>
            </span>
          ) : (
            <button className="action push" onClick={() => setConfirming(true)} aria-label="Delete post">
              <Icon name="trash" size={17} />
            </button>
          )
        ) : (
          <button className="action push" onClick={message}>
            <Icon name="chat" size={18} /> Message
          </button>
        )}
      </footer>
      {boosting && <PromoteOptions postId={post.id} onClose={() => setBoosting(false)} />}

      {open && (
        <div className="comments">
          {post.comments.map((c) => {
            const who = person(c.authorId);
            return (
              <div key={c.id} className="comment">
                <Avatar person={who} size={28} />
                <div className="comment-bubble">
                  <span className="strong small">{who.name}</span> <span className="muted small">{timeAgo(c.at)}</span>
                  <p>{c.text}</p>
                </div>
              </div>
            );
          })}
          <div className="comment-input">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Write a reply…"
              aria-label="Write a reply"
            />
            <button className="icon-btn ghost" onClick={send} aria-label="Send reply" disabled={!reply.trim()}>
              <Icon name="send" size={17} />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
