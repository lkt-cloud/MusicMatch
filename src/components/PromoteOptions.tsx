import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { startCheckout, type PromotionType } from '../backend/api';
import { usePromotionFlags } from '../backend/promotions';
import { LAUNCH_LABEL, usePricing } from '../data/pricing';
import { hasRole } from '../data/roles';
import { useStore } from '../store';
import { Icon } from './Icon';

/**
 * Paid promotion choices. With `postId` it offers boosting that post; otherwise the
 * profile options. Payment happens on Stripe Checkout; nothing switches on until
 * Stripe confirms it.
 */
export function PromoteOptions({ postId, onClose, onCreatePromo }: { postId?: string; onClose: () => void; onCreatePromo?: () => void }) {
  const PRICING = usePricing();
  const { live, me, meId, promoted } = useStore();
  const flags = usePromotionFlags();
  const [busy, setBusy] = useState<PromotionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const running = (type: PromotionType) =>
    postId ? flags.isBoosted(postId) : promoted.some((p) => p.userId === meId && p.type === type);

  const options: PromotionType[] = postId
    ? ['boost_post']
    : ['featured_profile', ...(hasRole(me, 'studio') ? (['studio_listing'] as const) : [])];

  const buy = async (type: PromotionType) => {
    setBusy(type);
    setError(null);
    try {
      await startCheckout(type, postId); // leaves the page for Stripe
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t start checkout.');
      setBusy(null);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal promote-options" role="dialog" aria-modal="true" aria-label="Promote">
        <header className="cropper-head">
          <h2>{postId ? 'Boost this post' : 'Promote yourself'}</h2>
          <button className="icon-btn ghost" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="price-list">
          {options.map((type) => {
            const p = PRICING[type];
            const on = running(type);
            return (
              <div key={type} className={`price-card${on ? ' is-on' : ''}`}>
                <div className="price-top">
                  <strong>{p.name}</strong>
                  <span className="launch">{LAUNCH_LABEL}</span>
                </div>
                <div className="price-amount">
                  {p.price} <span>{p.per}</span>
                </div>
                <p>{p.blurb}</p>
                {on ? (
                  <span className="tag-good">Running now</span>
                ) : (
                  <button className="btn primary" onClick={() => buy(type)} disabled={!live || busy !== null}>
                    {busy === type ? 'Opening checkout…' : `Continue · ${p.price}`}
                  </button>
                )}
              </div>
            );
          })}

          {!postId && onCreatePromo && (
            <button className="price-card is-link" onClick={onCreatePromo}>
              <div className="price-top">
                <strong>{PRICING.boost_post.name}</strong>
                <span className="launch">{LAUNCH_LABEL}</span>
              </div>
              <div className="price-amount">
                {PRICING.boost_post.price} <span>{PRICING.boost_post.per}</span>
              </div>
              <p>Post a photo or video of your work and boost it to the top of Community.</p>
            </button>
          )}
        </div>

        {error && <p className="field-note is-bad">{error}</p>}
        {!live && (
          <p className="field-note">
            Payments switch on once the site is connected to Supabase and Stripe (see SETUP.md). This is a preview.
          </p>
        )}
        <p className="field-note">
          Secure payment by Stripe. Cancel any time from <Link to="/promotions" onClick={onClose}>Your promotions</Link>.
        </p>
      </div>
    </div>
  );
}
