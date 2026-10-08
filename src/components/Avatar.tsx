import { roleInfo } from '../data/roles';
import { useSharedFileUrl } from '../data/attachments';
import type { Creative } from '../data/types';
import { RoleIcon } from './Icon';

export function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

/** Profile picture (or initials tinted by role); `badge` adds the role's icon in the corner. */
export function Avatar({ person, size = 40, badge = false }: { person: Creative; size?: number; badge?: boolean }) {
  const photo = useSharedFileUrl(person.avatarId);
  return (
    <span
      className={`avatar${photo ? ' has-photo' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.36, ['--role' as string]: roleInfo(person.role).color }}
      aria-hidden
    >
      {photo ? <img src={photo} alt="" /> : initials(person.name)}
      {badge && (
        <span className="avatar-badge" style={{ width: size * 0.42, height: size * 0.42 }}>
          <RoleIcon role={person.role} size={Math.round(size * 0.25)} />
        </span>
      )}
    </span>
  );
}
