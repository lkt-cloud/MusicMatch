import type { Creative, PostKind, Role } from './types';
import { t } from '../i18n';

export const ROLES: { id: Role; label: string; plural: string; color: string }[] = [
  { id: 'artist', get label() { return t('Artist'); }, get plural() { return t('Artists'); }, color: '#8a5a44' },
  { id: 'producer', get label() { return t('Producer'); }, get plural() { return t('Producers'); }, color: '#4f6b4a' },
  { id: 'videographer', get label() { return t('Videographer'); }, get plural() { return t('Videographers'); }, color: '#b8743f' },
  { id: 'studio', get label() { return t('Studio'); }, get plural() { return t('Studios'); }, color: '#44627a' },
  { id: 'engineer', get label() { return t('Engineer'); }, get plural() { return t('Engineers'); }, color: '#a08a3c' },
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

/**
 * The profile changes for a new set of roles: rates follow their role (so swapping the main
 * role keeps every price in place), and the travel radius and studio address come and go with
 * the roles that use them.
 */
export function rolePatch(me: Creative, role: Role, alsoRoles: Role[]): Partial<Creative> {
  const all = [role, ...alsoRoles];
  const rates: Partial<Record<Role, string>> = { ...me.roleRates, [me.role]: me.rate };
  return {
    role,
    alsoRoles: alsoRoles.filter((r) => r !== role),
    rate: rates[role] ?? '',
    roleRates: Object.fromEntries(alsoRoles.filter((r) => r !== role && rates[r]).map((r) => [r, rates[r]])),
    travelMiles: travels(all) ? me.travelMiles ?? 25 : undefined,
    address: all.includes('studio') ? me.address : undefined,
  };
}

/** Roles that sell a visual service and can promote it with a photo or video. */
const PROMOTERS: Role[] = ['studio', 'engineer', 'videographer'];
export const canPromote = (c: Pick<Creative, 'role' | 'alsoRoles'>) => rolesOf(c).some((r) => PROMOTERS.includes(r));

/** Post topics. `icon` is an Icon name; kept as a string here to avoid a UI import. */
export const POST_KINDS: { id: PostKind; label: string; icon: string; hint: string }[] = [
  { id: 'collab', get label() { return t('Collab'); }, icon: 'notes', get hint() { return t('Looking to work with someone'); } },
  { id: 'promo', get label() { return t('Self-promo'); }, icon: 'mic', get hint() { return t('New drops, releases, packs, open bookings'); } },
  { id: 'question', get label() { return t('Question'); }, icon: 'chat', get hint() { return t('Ask the community'); } },
];

export const kindLabel = (kind: PostKind) => POST_KINDS.find((k) => k.id === kind)!.label;
