import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ROLES, canPromote, hasRole, ratesOf, roleInfo, rolesOf, travels } from '../data/roles';
import { countryName, flag, loadCities } from '../data/places';
import { PLATFORMS, normalizeSocialUrl, platformInfo } from '../data/socials';
import type { Creative, Role, SocialPlatform } from '../data/types';
import { useStore } from '../store';
import { formatMiles, milesBetween, reaches } from '../map/shared';
import { Avatar } from '../components/Avatar';
import { RoleLine } from '../components/RoleBadge';
import { Icon, RoleIcon } from '../components/Icon';
import { PlatformIcon, SocialLinks } from '../components/SocialLinks';
import { CityPicker, CountrySelect, geocodeAddress } from '../components/LocationFields';
import { timeAgo } from '../components/time';
import { GenreChips, GenrePicker } from '../components/Genres';
import { AvatarEditor, ProfileCover } from '../components/ProfileMedia';
import { PromoteModal } from '../components/PromoteModal';
import { PromoteOptions } from '../components/PromoteOptions';
import { usePromotionFlags } from '../backend/promotions';
import { AttachmentView } from '../components/AttachmentView';

const REVIEWS = [
  { by: 'lilmerit', text: 'Easy to work with and fast. The final product was better than I pictured.', days: 12 },
  { by: 'dresolace', text: 'Professional from start to finish. Already booked again.', days: 34 },
  { by: 'kayawells', text: 'Great energy in the room, knows exactly what they want.', days: 61 },
];

const directionsUrl = ([lng, lat]: [number, number]) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;

export function ProfilePage({ mine = false }: { mine?: boolean }) {
  const { id } = useParams();
  const { me, meId, posts, person, creatives, signOut } = useStore();
  const flags = usePromotionFlags();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [choosing, setChoosing] = useState(false);

  if (id === meId) return <Navigate to="/me" replace />;
  const p = mine ? me : creatives.find((c) => c.id === id);
  if (!p) return <div className="page"><p className="empty">That profile doesn’t exist.</p></div>;

  const theirPosts = posts.filter((x) => x.authorId === p.id);
  const featured = theirPosts.find(
    (x) => x.id === p.featuredPostId && x.attachments?.some((a) => a.kind === 'image' || a.kind === 'video'),
  );
  const color = roleInfo(p.role).color;
  const away = mine ? null : milesBetween(me.coords, p.coords);

  return (
    <div className="page profile">
      <section className="card profile-card">
        <div style={{ ['--role' as string]: color }}>
          <ProfileCover person={p} editable={mine && editing}>
          </ProfileCover>
        </div>
        <div className="profile-head">
          {mine && editing ? (
            <AvatarEditor>
              <Avatar person={p} size={92} badge />
            </AvatarEditor>
          ) : (
            <Avatar person={p} size={92} badge />
          )}
          <div className="profile-id">
            <h1>{p.name}</h1>
            {flags.isVerifiedStudio(p.id) && (
              <span className="verified" title="Verified Studio listing">
                <Icon name="speaker" size={13} /> Verified Studio
              </span>
            )}
            <div className="muted">
              <RoleLine person={p} /> · <Icon name="pin" size={14} /> {p.city && `${p.city}, `}
              {flag(p.country)} {countryName(p.country)}
              {away != null && <> · {formatMiles(away)} away</>}
            </div>
          </div>
          <div className="profile-actions">
            {mine ? (
              <>
                {!editing && (
                  <button className="btn primary" onClick={() => setChoosing(true)}>
                    <Icon name="star" size={16} /> Promote
                  </button>
                )}
                <button className={`btn${editing ? ' primary' : ''}`} onClick={() => setEditing((e) => !e)}>
                  {!editing && <Icon name="edit" size={16} />} {editing ? 'Done' : 'Edit profile'}
                </button>
                {!editing && (
                  <Link className="btn" to="/promotions">
                    Your promotions
                  </Link>
                )}
                {!editing && signOut && (
                  <button className="btn" onClick={signOut}>
                    Sign out
                  </button>
                )}
              </>
            ) : (
              <button className="btn primary" onClick={() => navigate(`/messages/${p.id}`)}>
                <Icon name="chat" size={17} /> Message
              </button>
            )}
          </div>
        </div>

        {mine && editing ? (
          <EditForm />
        ) : (
          <>
            <p className="profile-bio">{p.bio}</p>
            <div className="profile-stats">
              <Rates person={p} />
              {!mine && (
                <div>
                  <span className="stat-label">Rating</span>
                  <strong className="rating">
                    {p.reviews ? (
                      <>
                        <Icon name="star" size={14} filled /> {p.rating.toFixed(1)} <span className="muted small">({p.reviews})</span>
                      </>
                    ) : (
                      'New'
                    )}
                  </strong>
                </div>
              )}
              <div>
                <span className="stat-label">Status</span>
                <strong className={p.available ? 'available' : 'muted'}>{p.available ? 'Available' : 'Booked up'}</strong>
              </div>
            </div>
            <GenreChips ids={p.genres} />

            <LocationInfo person={p} me={me} mine={mine} />

            {p.socials.length > 0 ? (
              <div className="profile-block">
                <h3 className="block-title">Find {mine ? 'me' : p.name.split(' ')[0]} online</h3>
                <SocialLinks socials={p.socials} />
              </div>
            ) : (
              mine && (
                <p className="hint">
                  <Icon name="link" size={15} /> Add your Instagram, Spotify, YouTube and more with <b>Edit profile</b>.
                </p>
              )
            )}
          </>
        )}
      </section>

      {featured && (
        <section>
          <h2 className="section-title">Featured</h2>
          <div className="card featured">
            <div className="featured-media">
              <AttachmentView file={featured.attachments!.find((a) => a.kind === 'image' || a.kind === 'video')!} />
            </div>
            {(featured.text || !mine) && (
              <div className="featured-foot">
                {featured.text && <p>{featured.text}</p>}
                {!mine && (
                  <button className="btn primary" onClick={() => navigate(`/messages/${p.id}`)}>
                    Book {p.name.split(' ')[0]}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {promoting && <PromoteModal onClose={() => setPromoting(false)} />}
      {choosing && (
        <PromoteOptions
          onClose={() => setChoosing(false)}
          onCreatePromo={
            canPromote(p)
              ? () => {
                  setChoosing(false);
                  setPromoting(true);
                }
              : undefined
          }
        />
      )}

      {p.work.length > 0 && (
        <section>
          <h2 className="section-title">{hasRole(p, 'studio') ? 'The space' : 'Work'}</h2>
          <div className="work-grid">
            {p.work.map((w, i) => (
              <div key={w} className="work-tile" style={{ ['--i' as string]: i }}>
                <span className="work-vinyl" aria-hidden />
                <span className="work-play"><Icon name="play" size={16} filled /></span>
                <span className="work-title">{w}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {theirPosts.length > 0 && (
        <section>
          <h2 className="section-title">Posts</h2>
          <div className="mini-posts">
            {theirPosts.map((x) => (
              <Link to="/feed" key={x.id} className="card mini-post">
                <p>{x.text}</p>
                <span className="muted small">
                  {timeAgo(x.at)} · {x.likes.length} {x.likes.length === 1 ? 'like' : 'likes'} · {x.comments.length}{' '}
                  {x.comments.length === 1 ? 'reply' : 'replies'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!mine && (
        <section>
          <h2 className="section-title">Reviews</h2>
          <div className="reviews">
            {REVIEWS.filter((r) => r.by !== p.id).slice(0, 2).map((r) => {
              const who = person(r.by);
              return (
                <div key={r.by} className="card review">
                  <div className="review-head">
                    <Avatar person={who} size={32} />
                    <strong className="small">{who.name}</strong>
                    <span className="rating small">★★★★★</span>
                    <span className="muted small push">{r.days}d ago</span>
                  </div>
                  <p>{r.text}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function LocationInfo({ person: p, me, mine }: { person: Creative; me: Creative; mine: boolean }) {
  const studio = hasRole(p, 'studio') && p.address;
  return (
    <>
      {studio && (
        <div className="profile-block place-card">
          <span className="place-icon"><Icon name="pin" size={20} /></span>
          <div>
            <span className="stat-label">Studio location</span>
            <strong>{p.address}</strong>
          </div>
          <div className="place-actions">
            <a className="btn" href={directionsUrl(p.coords)} target="_blank" rel="noopener noreferrer">
              <Icon name="directions" size={16} /> Directions
            </a>
            {!mine && (
              <Link className="btn" to={`/?focus=${p.id}`}>
                <Icon name="map" size={16} /> Map
              </Link>
            )}
          </div>
        </div>
      )}
      {p.travelMiles != null && travels(rolesOf(p)) && (
        <div className="profile-block place-card">
          <span className="place-icon"><Icon name="radius" size={20} /></span>
          <div>
            <span className="stat-label">Travel radius</span>
            <strong>
              Up to {p.travelMiles} miles from {p.city}
            </strong>
            {!mine && reaches(p, me.coords) && <span className="tag-good">Can come to you</span>}
          </div>
          {!mine && !studio && (
            <div className="place-actions">
              <Link className="btn" to={`/?focus=${p.id}`}>
                <Icon name="map" size={16} /> See on map
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function EditForm() {
  const { me, updateMe } = useStore();
  const set = (patch: Partial<Creative>) => updateMe(patch);

  // Keeps the travel radius and studio address in step with whatever roles are picked.
  const setRoles = (role: Role, alsoRoles: Role[]) => {
    const all = [role, ...alsoRoles];
    // Rates follow their role, so swapping the main role keeps every price in place.
    const rates: Partial<Record<Role, string>> = { ...me.roleRates, [me.role]: me.rate };
    set({
      role,
      alsoRoles: alsoRoles.filter((r) => r !== role),
      rate: rates[role] ?? '',
      roleRates: Object.fromEntries(alsoRoles.filter((r) => r !== role && rates[r]).map((r) => [r, rates[r]])),
      travelMiles: travels(all) ? me.travelMiles ?? 25 : undefined,
      address: all.includes('studio') ? me.address : undefined,
    });
  };

  return (
    <div className="edit-form">
      <fieldset>
        <legend><Icon name="user" size={16} /> About you</legend>
        <label>
          <span>Name</span>
          <input value={me.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          <span>Main role</span>
          <select value={me.role} onChange={(e) => setRoles(e.target.value as Role, me.alsoRoles)}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <div className="wide also-field">
          <span className="field-label">Also work as <span className="muted">— pick any that apply</span></span>
          <div className="chips">
            {ROLES.filter((r) => r.id !== me.role).map((r) => {
              const on = me.alsoRoles.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`chip role-chip${on ? ' is-on' : ''}`}
                  style={{ ['--role' as string]: r.color }}
                  aria-pressed={on}
                  onClick={() => setRoles(me.role, on ? me.alsoRoles.filter((x) => x !== r.id) : [...me.alsoRoles, r.id])}
                >
                  <RoleIcon role={r.id} size={15} />
                  {r.label}
                  {on && <Icon name="close" size={12} />}
                </button>
              );
            })}
          </div>
          <p className="field-note">Your main role sets your pin on the map. People searching for any of these will find you.</p>
        </div>
        <RatesEditor />
        <div className="wide also-field">
          <span className="field-label">Genres <span className="muted">— pick as many as you like</span></span>
          <GenrePicker value={me.genres} onChange={(genres) => set({ genres })} />
        </div>
        <label className="wide">
          <span>Bio</span>
          <textarea rows={3} value={me.bio} onChange={(e) => set({ bio: e.target.value })} />
        </label>
      </fieldset>

      <fieldset>
        <legend><Icon name="pin" size={16} /> Where you work</legend>
        <label>
          <span>Country</span>
          <CountrySelect value={me.country} onChange={(country) => set({ country, city: '' })} />
        </label>
        <label>
          <span>City</span>
          <CityPicker
            key={me.country}
            country={me.country}
            value={me.city}
            // A studio's pinned address belongs to the old city, so it's cleared on a move.
            onPick={(place) => set({ city: place.name, coords: place.coords, address: undefined, exactLocation: false })}
          />
        </label>
        {hasRole(me, 'studio') ? <StudioAddress key={me.city} /> : <MapSpot />}
        {travels(rolesOf(me)) && <TravelRadius />}
      </fieldset>

      <fieldset>
        <legend><Icon name="link" size={16} /> Socials</legend>
        <SocialsEditor />
      </fieldset>
    </div>
  );
}

/** One rate, or a short list when someone prices more than one role. Blank ones are left out. */
function Rates({ person }: { person: Creative }) {
  const rates = ratesOf(person);
  if (rates.length <= 1)
    return (
      <div>
        <span className="stat-label">Rate</span>
        <strong>{rates[0]?.rate || 'Ask me'}</strong>
      </div>
    );
  return (
    <div className="stat-rates">
      <span className="stat-label">Rates</span>
      <ul>
        {rates.map(({ role, rate }) => (
          <li key={role}>
            <span className="rate-role"><RoleIcon role={role} size={14} /> {roleInfo(role).label}</span>
            <strong>{rate}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

const RATE_HINTS: Record<Role, string> = {
  artist: 'e.g. Features from $300',
  producer: 'e.g. Beats from $150',
  videographer: 'e.g. Shoots from $400',
  studio: 'e.g. $45 / hr',
  engineer: 'e.g. Mix $120 / song',
};

/** A rate box per role: just "Rate" for one role, labelled rows when there are more. */
function RatesEditor() {
  const { me, updateMe } = useStore();
  const roles = rolesOf(me);
  const setRate = (role: Role, value: string) =>
    role === me.role ? updateMe({ rate: value }) : updateMe({ roleRates: { ...me.roleRates, [role]: value } });
  const valueOf = (role: Role) => (role === me.role ? me.rate : me.roleRates?.[role] ?? '');

  if (roles.length === 1)
    return (
      <label>
        <span>Rate</span>
        <input value={me.rate} maxLength={80} placeholder={RATE_HINTS[me.role]} onChange={(e) => setRate(me.role, e.target.value)} />
      </label>
    );
  return (
    <div className="wide rates-field">
      <span className="field-label">Rates <span className="muted">— leave any blank to hide it</span></span>
      {roles.map((role) => (
        <label key={role} className="rate-row">
          <span className="rate-role"><RoleIcon role={role} size={15} /> {roleInfo(role).label}</span>
          <input value={valueOf(role)} maxLength={80} placeholder={RATE_HINTS[role]} onChange={(e) => setRate(role, e.target.value)} />
        </label>
      ))}
    </div>
  );
}

/** Whether your pin shows just your city (the default) or an exact spot. */
function MapSpot() {
  const { me, updateMe } = useStore();
  const [status, setStatus] = useState<'idle' | 'locating' | 'denied' | 'error'>('idle');
  const exact = !!me.exactLocation;

  const cityOnly = async () => {
    setStatus('idle');
    const city = (await loadCities(me.country)).find((c) => c.name === me.city);
    updateMe({ exactLocation: false, ...(city && { coords: city.coords }) });
  };
  const exactSpot = () => {
    if (!navigator.geolocation) return setStatus('error');
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateMe({ exactLocation: true, coords: [pos.coords.longitude, pos.coords.latitude] });
        setStatus('idle');
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="wide spot-field">
      <span className="field-label">Your pin on the map</span>
      <div className="segmented">
        <button type="button" className={exact ? '' : 'is-on'} aria-pressed={!exact} onClick={cityOnly}>
          <Icon name="map" size={15} /> City only
        </button>
        <button type="button" className={exact ? 'is-on' : ''} aria-pressed={exact} onClick={exactSpot} disabled={status === 'locating'}>
          <Icon name="pin" size={15} /> {status === 'locating' ? 'Finding you…' : exact ? 'Exact spot' : 'Use my exact spot'}
        </button>
      </div>
      <p className={`field-note${status === 'denied' || status === 'error' ? ' is-bad' : ''}`}>
        {status === 'denied' && 'Location access is off for this site. Allow it in your browser to pin an exact spot.'}
        {status === 'error' && 'Couldn’t get your location right now. Try again in a moment.'}
        {(status === 'idle' || status === 'locating') &&
          (exact
            ? 'Your pin is where you were when you set it. Switch back to City only any time.'
            : `Your pin sits above ${me.city || 'your city'} on the map, with everyone else there. Nobody sees where in the city you are.`)}
      </p>
    </div>
  );
}

function StudioAddress() {
  const { me, updateMe } = useStore();
  const [address, setAddress] = useState(me.address ?? '');
  const [status, setStatus] = useState<'idle' | 'looking' | 'found' | 'missing' | 'error'>(me.address ? 'found' : 'idle');

  const find = async () => {
    if (!address.trim()) return;
    setStatus('looking');
    try {
      const coords = await geocodeAddress(`${address}, ${me.city}, ${countryName(me.country)}`);
      if (!coords) return setStatus('missing');
      updateMe({ address: address.trim(), coords });
      setStatus('found');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="wide address-field">
      <label>
        <span>Studio street address</span>
        <div className="input-row">
          <input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setStatus('idle');
            }}
            onKeyDown={(e) => e.key === 'Enter' && find()}
            placeholder="e.g. 123 Main St, Suite 4"
          />
          <button type="button" className="btn" onClick={find} disabled={status === 'looking' || !address.trim()}>
            <Icon name="pin" size={16} /> {status === 'looking' ? 'Finding…' : 'Pin it'}
          </button>
        </div>
      </label>
      <p className={`field-note${status === 'found' ? ' is-good' : status === 'idle' ? '' : ' is-bad'}`}>
        {status === 'found' && `Pinned at the exact spot (${me.coords[1].toFixed(4)}, ${me.coords[0].toFixed(4)}). Artists will see it on the map.`}
        {status === 'idle' && 'Artists will see your studio at this exact spot on the map, with directions.'}
        {status === 'missing' && 'Couldn’t find that address — check the street and number.'}
        {status === 'error' && 'The address lookup isn’t reachable right now. Try again in a moment.'}
        {status === 'looking' && 'Looking it up…'}
      </p>
    </div>
  );
}

const RADIUS_PRESETS = [10, 25, 50, 100, 250];

function TravelRadius() {
  const { me, updateMe } = useStore();
  const miles = me.travelMiles ?? 25;
  return (
    <div className="wide radius-field">
      <div className="radius-top">
        <span>How far will you travel for a session?</span>
        <strong>{miles >= 500 ? 'Anywhere' : `${miles} mi`}</strong>
      </div>
      <input
        type="range"
        min={0}
        max={500}
        step={5}
        value={miles}
        onChange={(e) => updateMe({ travelMiles: Number(e.target.value) })}
        style={{ ['--pct' as string]: `${(miles / 500) * 100}%` }}
        aria-label="Travel radius in miles"
      />
      <div className="chips">
        {RADIUS_PRESETS.map((m) => (
          <button key={m} type="button" className={`chip${miles === m ? ' is-on' : ''}`} onClick={() => updateMe({ travelMiles: m })}>
            {m} mi
          </button>
        ))}
      </div>
    </div>
  );
}

type Draft = { platform: SocialPlatform; text: string; error?: boolean };

function SocialsEditor() {
  const { me, updateMe } = useStore();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    me.socials.length ? me.socials.map((s) => ({ platform: s.platform, text: s.url })) : [{ platform: 'instagram', text: '' }],
  );

  const commit = (next: Draft[]) => {
    setDrafts(next);
    updateMe({
      socials: next.flatMap((d) => {
        const url = normalizeSocialUrl(d.platform, d.text);
        return url ? [{ platform: d.platform, url }] : [];
      }),
    });
  };

  const edit = (i: number, patch: Partial<Draft>) => commit(drafts.map((d, j) => (j === i ? { ...d, ...patch, error: false } : d)));

  const used = new Set(drafts.map((d) => d.platform));
  const nextPlatform = PLATFORMS.find((p) => !used.has(p.id))?.id ?? 'website';

  return (
    <div className="wide socials-editor">
      {drafts.map((d, i) => (
        <div key={i} className="social-row" style={{ ['--brand' as string]: platformInfo(d.platform).color }}>
          <span className="social-row-icon"><PlatformIcon platform={d.platform} size={18} /></span>
          <select value={d.platform} onChange={(e) => edit(i, { platform: e.target.value as SocialPlatform })} aria-label="Platform">
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            value={d.text}
            className={d.error ? 'is-invalid' : ''}
            placeholder={platformInfo(d.platform).fromHandle ? '@handle or full link' : 'https://…'}
            onChange={(e) => edit(i, { text: e.target.value })}
            onBlur={() => {
              const url = normalizeSocialUrl(d.platform, d.text);
              setDrafts((all) => all.map((x, j) => (j === i ? { ...x, text: url ?? x.text, error: !!x.text.trim() && !url } : x)));
            }}
            aria-label={`${platformInfo(d.platform).label} link`}
          />
          <button type="button" className="icon-btn ghost" onClick={() => commit(drafts.filter((_, j) => j !== i))} aria-label="Remove link">
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      {drafts.some((d) => d.error) && <p className="field-note is-bad">That doesn’t look like a web link. Use a full https:// link or an @handle.</p>}
      <button type="button" className="btn add-link" onClick={() => setDrafts((all) => [...all, { platform: nextPlatform, text: '' }])}>
        <Icon name="plus" size={16} /> Add a link
      </button>
    </div>
  );
}

