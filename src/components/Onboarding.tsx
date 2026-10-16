import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { ROLES, rolePatch } from '../data/roles';
import type { Role } from '../data/types';
import { Avatar } from './Avatar';
import { Icon, RoleIcon } from './Icon';
import { CityPicker, CountrySelect } from './LocationFields';
import { AvatarEditor } from './ProfileMedia';
import { t } from '../i18n';

// First-time setup, straight after signing up: what you do, where you're based and a photo.
// Without a city nobody shows up on the map, so this is shown until there is one. It can be
// skipped; your profile then shows a card to finish it later.

const SKIP_KEY = 'music-match:setup-skipped';

const skipped = (id: string) => {
  try {
    return localStorage.getItem(SKIP_KEY) === id;
  } catch {
    return false;
  }
};
const rememberSkip = (id: string | null) => {
  try {
    if (id) localStorage.setItem(SKIP_KEY, id);
    else localStorage.removeItem(SKIP_KEY);
  } catch {
    // storage blocked: it just shows again next time
  }
};

/** The country this phone or browser is set to, as a first guess (e.g. ja-JP → JP). */
function guessCountry(fallback: string) {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  } catch {
    // older browsers
  }
  return fallback;
}

/** True when your profile still needs setting up (no city yet). */
export function useNeedsSetup() {
  const { signedIn, me, meId } = useStore();
  return signedIn && me.id === meId && !me.city;
}

/** Shown on your own profile when you skipped setup. */
export function FinishSetupCard() {
  const needs = useNeedsSetup();
  if (!needs) return null;
  return (
    <div className="notify-card setup-card">
      <span className="notify-icon">
        <Icon name="pin" size={20} />
      </span>
      <div className="notify-text">
        <strong>{t('You’re not on the map yet')}</strong>
        <span>{t('Add what you do and your city so people near you can find you.')}</span>
      </div>
      <button
        className="btn primary"
        onClick={() => {
          rememberSkip(null);
          window.dispatchEvent(new Event('mm-setup'));
        }}
      >
        {t('Finish setup')}
      </button>
    </div>
  );
}

export function Onboarding() {
  const { me, meId, updateMe } = useStore();
  const needs = useNeedsSetup();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => needs && !skipped(meId));
  const [step, setStep] = useState(0);
  // A main role has to be picked on purpose: new accounts start as "artist" by default.
  const [picked, setPicked] = useState<Role | null>(null);

  // Opens for a newly signed-up account, and from the "Finish setup" card.
  useEffect(() => {
    if (needs && !skipped(meId)) setOpen(true);
  }, [needs, meId]);
  useEffect(() => {
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener('mm-setup', reopen);
    return () => window.removeEventListener('mm-setup', reopen);
  }, []);
  // First guess at the country, from the phone's region settings.
  useEffect(() => {
    if (open && !me.city) {
      const guess = guessCountry(me.country);
      if (guess !== me.country) updateMe({ country: guess });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const close = (finished: boolean) => {
    setOpen(false);
    if (!finished) rememberSkip(meId);
    else navigate('/');
  };

  const steps = [
    {
      title: t('Welcome to Music Match'),
      sub: t('Let’s set up your profile so people can find you. It takes a minute.'),
      ready: !!me.name.trim() && !!picked,
      body: (
        <>
          <label className="setup-field">
            <span className="field-label">{t('Your name or artist name')}</span>
            <input value={me.name} maxLength={80} onChange={(e) => updateMe({ name: e.target.value })} placeholder={t('e.g. Ama K')} autoFocus />
          </label>
          <div className="setup-field">
            <span className="field-label">{t('What do you do?')}</span>
            <div className="setup-roles">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`setup-role${picked === r.id ? ' is-on' : ''}`}
                  style={{ ['--role' as string]: r.color }}
                  aria-pressed={picked === r.id}
                  onClick={() => {
                    setPicked(r.id);
                    updateMe(rolePatch(me, r.id, me.alsoRoles));
                  }}
                >
                  <RoleIcon role={r.id} size={22} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {picked && (
            <div className="setup-field">
              <span className="field-label">
                {t('Anything else?')} <span className="muted">{t('Optional')}</span>
              </span>
              <div className="chips">
                {ROLES.filter((r) => r.id !== picked).map((r) => {
                  const on = me.alsoRoles.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`chip${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() =>
                        updateMe(rolePatch(me, picked, on ? me.alsoRoles.filter((x) => x !== r.id) : [...me.alsoRoles, r.id]))
                      }
                    >
                      <RoleIcon role={r.id} size={14} />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ),
    },
    {
      title: t('Where are you based?'),
      sub: t('You’ll show up on the map in your city. Only the city is shown, not where you live.'),
      ready: !!me.city,
      body: (
        <>
          <label className="setup-field">
            <span className="field-label">{t('Country')}</span>
            <CountrySelect value={me.country} onChange={(country) => updateMe({ country, city: '' })} />
          </label>
          <label className="setup-field">
            <span className="field-label">{t('City')}</span>
            <CityPicker
              key={me.country}
              country={me.country}
              value={me.city}
              onPick={(place) => updateMe({ city: place.name, coords: place.coords, address: undefined, exactLocation: false })}
            />
          </label>
          {me.city && (
            <p className="field-note is-good">
              <Icon name="pin" size={14} /> {t('You’ll appear around {city}.', { city: me.city })}
            </p>
          )}
        </>
      ),
    },
    {
      title: t('Add a profile photo'),
      sub: t('People are much more likely to message someone with a photo. You can change it any time.'),
      ready: true,
      body: (
        <div className="setup-photo">
          <AvatarEditor>
            <Avatar person={me} size={120} />
          </AvatarEditor>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="modal-backdrop setup-backdrop">
      <div className="modal setup" role="dialog" aria-modal="true" aria-label={current.title}>
        <div className="setup-top">
          <div className="setup-dots" aria-label={t('Step {n} of {total}', { n: step + 1, total: steps.length })}>
            {steps.map((_, i) => (
              <span key={i} className={i <= step ? 'is-on' : ''} />
            ))}
          </div>
          <button className="link muted-link" onClick={() => close(false)}>
            {t('Skip for now')}
          </button>
        </div>
        <div className="setup-head">
          <h2>{current.title}</h2>
          <p className="promote-sub">{current.sub}</p>
        </div>
        <div className="setup-body">{current.body}</div>
        <div className="cropper-foot">
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              {t('Back')}
            </button>
          )}
          <button
            className="btn primary"
            disabled={!current.ready}
            onClick={() => (last ? close(true) : setStep(step + 1))}
          >
            {last ? (me.avatarId ? t('Done') : t('Finish without a photo')) : t('Next')}
          </button>
        </div>
      </div>
    </div>
  );
}
