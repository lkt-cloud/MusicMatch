import type { Creative, PostKind, Role } from './types';

export const ROLES: { id: Role; label: string; plural: string; color: string }[] = [
  { id: 'artist', label: 'Artist', plural: 'Artists', color: '#8a5a44' },
  { id: 'producer', label: 'Producer', plural: 'Producers', color: '#4f6b4a' },
  { id: 'videographer', label: 'Videographer', plural: 'Videographers', color: '#b8743f' },
  { id: 'studio', label: 'Studio', plural: 'Studios', color: '#44627a' },
  { id: 'engineer', label: 'Engineer', plural: 'Engineers', color: '#a08a3c' },
];

export const roleInfo = (role: Role) => ROLES.find((r) => r.id === role)!;

/** Main role first, then the rest. */
export const rolesOf = (c: Pick<Creative, 'role' | 'alsoRoles'>) => [c.role, ...c.alsoRoles.filter((r) => r !== c.role)];
export const hasRole = (c: Pick<Creative, 'role' | 'alsoRoles'>, role: Role) => rolesOf(c).includes(role);

/** Each role's rate, main role first, skipping any left blank. */
export const ratesOf = (c: Pick<Creative, 'role' | 'alsoRoles' | 'rate' | 'roleRates'>) =>
  rolesOf(c)
    .map((role) => ({ role, rate: ((role === c.role ? c.rate : c.roleRates?.[role]) ?? '').trim() }))
    .filter((r) => r.rate);

/** Roles that travel to sessions (and so get a travel radius). */
const TRAVELING: Role[] = ['producer', 'videographer', 'engineer'];
export const travels = (roles: Role[]) => roles.some((r) => TRAVELING.includes(r));

/** Roles that sell a visual service and can promote it with a photo or video. */
const PROMOTERS: Role[] = ['studio', 'engineer', 'videographer'];
export const canPromote = (c: Pick<Creative, 'role' | 'alsoRoles'>) => rolesOf(c).some((r) => PROMOTERS.includes(r));

/** Post topics. `icon` is an Icon name; kept as a string here to avoid a UI import. */
export const POST_KINDS: { id: PostKind; label: string; icon: string; hint: string }[] = [
  { id: 'collab', label: 'Collab', icon: 'notes', hint: 'Looking to work with someone' },
  { id: 'promo', label: 'Self-promo', icon: 'mic', hint: 'New drops, releases, packs, open bookings' },
  { id: 'question', label: 'Question', icon: 'chat', hint: 'Ask the community' },
];

export const kindLabel = (kind: PostKind) => POST_KINDS.find((k) => k.id === kind)!.label;
