import { Link } from 'react-router-dom';
import type { Creative } from '../data/types';
import { Avatar } from './Avatar';
import { RoleLine } from './RoleBadge';
import { Icon } from './Icon';
import { usePromotionFlags } from '../backend/promotions';
import { t } from '../i18n';
import { cityName } from '../data/places';

// Links to the profile, or runs onClick instead when given (e.g. focus on the map).
export function CreativeRow({
  person,
  active,
  onClick,
  meta,
  promoted = false,
}: {
  person: Creative;
  active?: boolean;
  onClick?: () => void;
  /** Extra detail on the right, e.g. distance. */
  meta?: string;
  /** Shown first in a list because of a paid Featured profile. */
  promoted?: boolean;
}) {
  const flags = usePromotionFlags();
  const verified = flags.isVerifiedStudio(person.id);
  const body = (
    <>
      <Avatar person={person} size={44} badge />
      <span className="creative-row-text">
        <strong>
          {person.name}
          {verified && (
            <span className="verified is-small" title={t('Verified Studio')}>
              <Icon name="speaker" size={11} /> {t('Verified')}
            </span>
          )}
        </strong>
        <span className="muted small">
          <RoleLine person={person} compact /> · {cityName(person.city, person.country)}
        </span>
      </span>
      <span className="creative-row-side small">
        {promoted ? (
          <span className="promoted-tag is-inline">{t('Promoted')}</span>
        ) : person.reviews ? (
          <span className="rating">
            <Icon name="star" size={13} filled /> {person.rating.toFixed(1)}
          </span>
        ) : (
          <span className="muted">{t('New')}</span>
        )}
        {meta && <span className="muted">{meta}</span>}
      </span>
    </>
  );
  const cls = `creative-row${active ? ' is-active' : ''}${verified ? ' is-verified' : ''}`;
  return onClick ? (
    <button className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <Link className={cls} to={`/u/${person.id}`}>
      {body}
    </Link>
  );
}
