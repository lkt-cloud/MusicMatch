import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cancelPromotion, fetchMyPromotions, type MyPromotion } from '../backend/api';
import { LAUNCH_LABEL, usePricing } from '../data/pricing';
import { useStore } from '../store';
import { SignInPrompt } from '../components/SignInPrompt';
import { Icon } from '../components/Icon';
import { PromoteOptions } from '../components/PromoteOptions';
import { locale, t } from '../i18n';

const STATUS: Record<MyPromotion['status'], { label: string; tone: 'good' | 'wait' | 'off' }> = {
  pending: { get label() { return t('Waiting for payment'); }, tone: 'wait' },
  active: { get label() { return t('Active'); }, tone: 'good' },
  past_due: { get label() { return t('Payment failed'); }, tone: 'off' },
  canceled: { get label() { return t('Canceled'); }, tone: 'off' },
  expired: { get label() { return t('Ended'); }, tone: 'off' },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/** Your paid promotions: see what's running, and cancel. */
export function PromotionsPage() {
  const { signedIn } = useStore();
  return signedIn ? <PromotionsPageContent /> : <SignInPrompt icon="star" title={t('Your promotions')} text="Sign in to promote your posts and profile." />;
}

function PromotionsPageContent() {
  const PRICING = usePricing();
  const { live, posts, refreshPromotions } = useStore();
  const [params, setParams] = useSearchParams();
  const checkout = params.get('checkout');
  const [items, setItems] = useState<MyPromotion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const load = useCallback(() => {
    if (!live) return setItems([]);
    fetchMyPromotions().then(setItems, (e) => setError(e.message));
  }, [live]);

  useEffect(load, [load]);

  // Back from Stripe: the webhook usually lands within seconds, so check a few times.
  useEffect(() => {
    if (checkout !== 'success' || !live) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      load();
      refreshPromotions();
      if (tries >= 10) window.clearInterval(id);
    }, 2500);
    return () => window.clearInterval(id);
  }, [checkout, live, load, refreshPromotions]);

  const cancel = async (p: MyPromotion) => {
    setCancelling(p.id);
    setError(null);
    try {
      await cancelPromotion(p.id);
      load();
      refreshPromotions();
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : 'Couldn’t cancel. Try again.');
    } finally {
      setCancelling(null);
      setConfirming(null);
    }
  };

  const visible = (items ?? []).filter((p) => p.status !== 'pending' || Date.now() - Date.parse(p.createdAt) < 60 * 60_000);

  return (
    <div className="page promotions">
      <header className="feed-head">
        <h1>{t('Your promotions')}</h1>
        <button className="btn primary" onClick={() => setChoosing(true)}>
          <Icon name="plus" size={16} /> {t('Promote')}
        </button>
      </header>

      {checkout === 'success' && (
        <div className="banner is-good">
          <Icon name="star" size={18} filled />
          <span>{t('Payment received. Your promotion switches on as soon as Stripe confirms it, usually within a few seconds.')}</span>
          <button className="icon-btn ghost" onClick={() => setParams({})} aria-label={t('Dismiss')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {checkout === 'canceled' && (
        <div className="banner">
          <span>{t('Checkout was canceled. You weren’t charged.')}</span>
          <button className="icon-btn ghost" onClick={() => setParams({})} aria-label={t('Dismiss')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {!live && (
        <div className="banner">
          <span>
            {t('Promotions turn on once the site is connected to Supabase and Stripe. Follow SETUP.md in the project folder.')}
          </span>
        </div>
      )}
      {error && <p className="field-note is-bad">{error}</p>}

      {items === null ? (
        <p className="empty">{t('Loading…')}</p>
      ) : visible.length === 0 ? (
        <div className="empty-promos">
          <p className="empty">{t('You haven’t promoted anything yet.')}</p>
          <div className="price-strip">
            {(Object.keys(PRICING) as (keyof typeof PRICING)[]).map((type) => (
              <div key={type} className="price-card">
                <div className="price-top">
                  <strong>{PRICING[type].name}</strong>
                  <span className="launch">{t(LAUNCH_LABEL)}</span>
                </div>
                <div className="price-amount">
                  {PRICING[type].price} <span>{PRICING[type].per}</span>
                </div>
                <p>{PRICING[type].blurb}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ul className="promo-list">
          {visible.map((p) => {
            const status = STATUS[p.status];
            const post = p.postId ? posts.find((x) => x.id === p.postId) : null;
            const canCancel = p.status === 'active' && !p.cancelAtPeriodEnd;
            return (
              <li key={p.id} className="card promo-row">
                <div className="promo-main">
                  <strong>{PRICING[p.type].name}</strong>
                  <span className="muted small">
                    {p.type === 'boost_post'
                      ? post
                        ? `“${post.text.slice(0, 70)}${post.text.length > 70 ? '…' : ''}”`
                        : t('A post')
                      : t('Your profile')}
                  </span>
                  <span className="muted small">
                    {PRICING[p.type].price} {PRICING[p.type].per} · {t(LAUNCH_LABEL)}
                  </span>
                </div>
                <div className="promo-side">
                  <span className={`status is-${status.tone}`}>{status.label}</span>
                  {p.status === 'active' && (
                    <span className="muted small">
                      {t(p.cancelAtPeriodEnd || p.type === 'boost_post' ? 'Ends {date}' : 'Renews {date}', { date: fmtDate(p.endsAt) })}
                    </span>
                  )}
                  {canCancel &&
                    (confirming === p.id ? (
                      <span className="promo-confirm">
                        <span className="small">
                          {p.type === 'boost_post' ? t('Stop the boost now? No refund.') : t('Stop renewing? It stays on until the end of this period.')}
                        </span>
                        <button className="btn danger" onClick={() => cancel(p)} disabled={cancelling === p.id}>
                          {cancelling === p.id ? t('Canceling…') : t('Yes, cancel')}
                        </button>
                        <button className="btn" onClick={() => setConfirming(null)}>
                          {t('Keep it')}
                        </button>
                      </span>
                    ) : (
                      <button className="btn" onClick={() => setConfirming(p.id)}>
                        {t('Cancel')}
                      </button>
                    ))}
                  {p.status === 'past_due' && (
                    <span className="small muted">{t('Update your card by promoting again, or contact support.')}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="field-note">
        {t('To boost a specific post, open Community and use Boost on one of your posts.')} <Link to="/feed">{t('Community')}</Link>
      </p>

      {choosing && <PromoteOptions onClose={() => setChoosing(false)} />}
    </div>
  );
}
