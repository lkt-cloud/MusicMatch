import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { ReportReason, ReportTarget } from '../backend/api';
import { Icon, type IconName } from './Icon';
import { t } from '../i18n';

// Report and block, as App Store guideline 1.2 requires for apps where people post and message.
// <SafetyMenu> is the "…" button; it opens the report form or the block confirmation.

const REASONS: { id: ReportReason; label: string; hint: string }[] = [
  { id: 'spam', label: 'Spam or scam', hint: 'Fake offers, taking deposits without delivering, unwanted ads' },
  { id: 'harassment', label: 'Harassment or hate', hint: 'Bullying, threats against a person, hateful content' },
  { id: 'sexual', label: 'Sexual or graphic content', hint: 'Including anything involving minors' },
  { id: 'violence', label: 'Violence or dangerous behaviour', hint: 'Threats, self-harm, illegal activity' },
  { id: 'impersonation', label: 'Pretending to be someone else', hint: 'Fake profile or stolen identity' },
  { id: 'copyright', label: 'Stolen work', hint: 'Music, video or images posted without permission' },
  { id: 'other', label: 'Something else', hint: '' },
];

const REASON_EN = Object.fromEntries(REASONS.map((r) => [r.id, r.label])) as Record<ReportReason, string>;
/** A report reason's name in the current language. */
export const reasonLabel = (r: ReportReason) => t(REASON_EN[r]);

const NOUN: Record<ReportTarget, string> = { post: 'post', comment: 'comment', profile: 'profile', message: 'message', review: 'review' };

export type SafetyTarget = {
  /** Who it's about. */
  userId: string;
  name: string;
  /** What's being reported. */
  type: ReportTarget;
  id: string;
};

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function SafetyMenu({
  target,
  label,
  align = 'right',
  onBlocked,
  extra,
}: {
  target: SafetyTarget;
  label?: string;
  align?: 'left' | 'right';
  onBlocked?: () => void;
  /** More items for the same menu, shown above Report and Block, e.g. "Delete conversation". */
  extra?: { label: string; icon: IconName; danger?: boolean; onClick: () => void }[];
}) {
  const { requireSignIn } = useStore();
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<'report' | 'block' | null>(null);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => !box.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const choose = (m: 'report' | 'block') => {
    setMenu(false);
    if (requireSignIn(m === 'report' ? t('Sign in to report something.') : t('Sign in to block people.'))) setModal(m);
  };

  return (
    <span className="safety" ref={box}>
      <button
        type="button"
        className="icon-btn ghost"
        onClick={() => setMenu((o) => !o)}
        aria-label={label ?? t('Report or block')}
        aria-expanded={menu}
        aria-haspopup="menu"
      >
        <Icon name="more" size={22} />
      </button>
      {menu && (
        <div className={`menu${align === 'left' ? ' is-left' : ''}`} role="menu">
          {extra?.map((x) => (
            <button
              key={x.label}
              role="menuitem"
              className={x.danger ? 'menu-danger' : undefined}
              onClick={() => {
                setMenu(false);
                x.onClick();
              }}
            >
              <Icon name={x.icon} size={16} /> {x.label}
            </button>
          ))}
          <button role="menuitem" onClick={() => choose('report')}>
            <Icon name="flag" size={16} /> {t('Report {thing}', { thing: t(NOUN[target.type]) })}
          </button>
          <button role="menuitem" className="menu-danger" onClick={() => choose('block')}>
            <Icon name="block" size={16} /> {t('Block {name}', { name: target.name })}
          </button>
        </div>
      )}
      {modal === 'report' && <ReportModal target={target} onClose={() => setModal(null)} />}
      {modal === 'block' && <BlockModal userId={target.userId} name={target.name} onClose={() => setModal(null)} onBlocked={onBlocked} />}
    </span>
  );
}

export function ReportModal({ target, onClose }: { target: SafetyTarget; onClose: () => void }) {
  const { report, blockUser, blocked } = useStore();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [state, setState] = useState<'form' | 'sending' | 'sent'>('form');
  const [error, setError] = useState<string | null>(null);

  const alreadyBlocked = blocked.includes(target.userId);
  // Blocking hides the post or comment this form belongs to, so it happens when the thank-you is closed.
  const finish = () => {
    if (alsoBlock && !alreadyBlocked) blockUser(target.userId);
    onClose();
  };
  useEscape(state === 'sent' ? finish : onClose);

  const send = async () => {
    if (!reason) return;
    setState('sending');
    setError(null);
    try {
      await report({ userId: target.userId, target: target.type, targetId: target.id, reason, details: details.trim() });
      setState('sent');
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Couldn’t send that. Try again.'));
      setState('form');
    }
  };

  return (
    <div className="modal-backdrop" onClick={state === 'sent' ? finish : onClose}>
      <div className="modal safety-modal" role="dialog" aria-modal="true" aria-label={t('Report {thing}', { thing: t(NOUN[target.type]) })} onClick={(e) => e.stopPropagation()}>
        {state === 'sent' ? (
          <>
            <div className="cropper-head">
              <h2>{t('Thanks for telling us')}</h2>
            </div>
            <p className="promote-sub">
              {t('We’ll look at this {thing} and remove it, and the account if needed, if it breaks the Terms.', { thing: t(NOUN[target.type]) })}
              {alsoBlock && !alreadyBlocked ? ' ' + t('{name} will be blocked, so you won’t see their content.', { name: target.name }) : ''}
            </p>
            <div className="cropper-foot">
              <button className="btn primary" onClick={finish}>
                {t('Done')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="cropper-head">
              <h2>{t('Report this {thing}', { thing: t(NOUN[target.type]) })}</h2>
              <button className="icon-btn ghost" onClick={onClose} aria-label={t('Close')}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <p className="promote-sub">
              {t('About {name}. We only look at it when you report it, and they won’t be told it was you.', { name: target.name })}
            </p>
            <div className="report-reasons" role="radiogroup" aria-label={t('Reason')}>
              {REASONS.map((r) => (
                <label key={r.id} className={`report-reason${reason === r.id ? ' is-on' : ''}`}>
                  <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} />
                  <span>
                    <strong>{t(r.label)}</strong>
                    {r.hint && <small>{t(r.hint)}</small>}
                  </span>
                </label>
              ))}
            </div>
            <textarea
              className="promote-caption"
              rows={3}
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t('Anything else we should know? (optional)')}
              aria-label={t('Details')}
            />
            {!alreadyBlocked && (
              <label className="check">
                <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
                <span>{t('Also block {name}', { name: target.name })}</span>
              </label>
            )}
            {error && <p className="field-note is-bad">{error}</p>}
            <div className="cropper-foot">
              <button className="btn" onClick={onClose}>
                {t('Cancel')}
              </button>
              <button className="btn primary" onClick={send} disabled={!reason || state === 'sending'}>
                {state === 'sending' ? t('Sending…') : t('Send report')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function BlockModal({ userId, name, onClose, onBlocked }: { userId: string; name: string; onClose: () => void; onBlocked?: () => void }) {
  const { blockUser } = useStore();
  useEscape(onClose);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal safety-modal" role="alertdialog" aria-modal="true" aria-label={t('Block {name}', { name })} onClick={(e) => e.stopPropagation()}>
        <div className="cropper-head">
          <h2>{t('Block {name}?', { name })}</h2>
        </div>
        <ul className="safety-list">
          <li>{t('You won’t see their posts, comments or profile, and they’ll be gone from the map for you.')}</li>
          <li>{t('Neither of you can send the other messages.')}</li>
          <li>{t('They aren’t told. You can unblock them any time in Settings.')}</li>
        </ul>
        <div className="cropper-foot">
          <button className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              blockUser(userId);
              onClose();
              onBlocked?.();
            }}
          >
            {t('Block')}
          </button>
        </div>
      </div>
    </div>
  );
}
