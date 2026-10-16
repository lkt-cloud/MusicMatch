import { useEffect, useRef, useState } from 'react';
import { MAX_FILE_MB, kindOf, rejectReason, saveFiles } from '../data/attachments';
import { useStore } from '../store';
import { startCheckout } from '../backend/api';
import { LAUNCH_LABEL, usePricing } from '../data/pricing';
import { Icon } from './Icon';
import { t } from '../i18n';

/**
 * Studios, engineers and videographers promote their work with one photo or video.
 * It's posted to Community as Self-promo (optionally featured on their profile), then
 * boosted to the top of the feed through a paid Stripe Checkout. The boost only
 * switches on once Stripe confirms the payment.
 */
export function PromoteModal({ onClose, onPosted }: { onClose: () => void; onPosted?: () => void }) {
  const PRICING = usePricing();
  const { addPost, live } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [feature, setFeature] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const kind = kindOf(f);
    if (kind !== 'image' && kind !== 'video') return setError(t('Pick a photo or a video.'));
    const bad = rejectReason(f);
    if (bad) return setError(bad);
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const share = async () => {
    if (!file) return;
    setPosting(true);
    try {
      const attachments = await saveFiles([file]);
      const postId = await addPost('promo', caption.trim(), attachments, feature);
      onPosted?.();
      if (live) {
        await startCheckout('boost_post', postId); // leaves the page for Stripe
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error && live ? e.message : t('Couldn’t save that file. Try a smaller one.'));
      setPosting(false);
    }
  };

  const isVideo = file && kindOf(file) === 'video';

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal promote" role="dialog" aria-modal="true" aria-label={t('Promote your work')}>
        <header className="cropper-head">
          <h2>{t('Promote your work')}</h2>
          <button className="icon-btn ghost" onClick={onClose} aria-label={t('Close')}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <p className="promote-sub">
          {t('Show the room, a mix session or a shoot. It goes to Community as Self-promo, with a button to book you.')}
        </p>

        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {preview ? (
          <div className="promote-media">
            {isVideo ? <video src={preview} controls playsInline /> : <img src={preview} alt="" />}
            <button className="media-btn promote-swap" onClick={() => input.current?.click()}>
              <Icon name="image" size={15} /> {t('Change')}
            </button>
          </div>
        ) : (
          <button
            className="promote-drop"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files[0]);
            }}
          >
            <span className="promote-icons">
              <Icon name="image" size={28} />
              <Icon name="camera" size={28} />
            </span>
            <strong>{t('Add a photo or video')}</strong>
            <span>{t('JPG, PNG, MP4 or MOV, up to {mb} MB', { mb: MAX_FILE_MB })}</span>
          </button>
        )}

        <textarea
          className="promote-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={t('Say what you offer: rates, availability, what makes your sessions different.')}
          rows={3}
          maxLength={600}
        />

        <label className="check">
          <input type="checkbox" checked={feature} onChange={(e) => setFeature(e.target.checked)} />
          <span>{t('Feature at the top of my profile')}</span>
        </label>

        <p className="promote-price">
          <strong>
            {PRICING.boost_post.price} <span>{PRICING.boost_post.per}</span>
          </strong>
          <span className="launch">{t(LAUNCH_LABEL)}</span>
          <span className="muted small">
            {live
              ? t('Your post goes up now and is boosted to the top of Community once payment goes through.')
              : t('Preview: payments switch on once the site is connected to Stripe (see SETUP.md). For now it posts without the boost.')}
          </span>
        </p>

        {error && <p className="field-note is-bad">{error}</p>}

        <footer className="cropper-foot">
          <button className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="btn primary" onClick={share} disabled={!file || posting}>
            {posting ? (live ? t('Opening checkout…') : t('Posting…')) : live ? t('Continue to payment · {price}', { price: PRICING.boost_post.price }) : t('Post promo')}
          </button>
        </footer>
      </div>
    </div>
  );
}
