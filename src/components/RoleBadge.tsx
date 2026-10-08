import { roleInfo } from '../data/roles';
import type { Creative, Role } from '../data/types';

export function RoleBadge({ role }: { role: Role }) {
  const info = roleInfo(role);
  return (
    <span className="role-badge" style={{ ['--role' as string]: info.color }}>
      <i />
      {info.label}
    </span>
  );
}

/**
 * Main role, plus anything else they do. `compact` collapses the extras to "+2".
 */
export function RoleLine({ person, compact = false }: { person: Pick<Creative, 'role' | 'alsoRoles'>; compact?: boolean }) {
  const also = person.alsoRoles.filter((r) => r !== person.role);
  return (
    <span className="role-line">
      <RoleBadge role={person.role} />
      {also.length > 0 &&
        (compact ? (
          <span className="role-more" title={`Also: ${also.map((r) => roleInfo(r).label).join(', ')}`}>+{also.length}</span>
        ) : (
          <span className="role-also"> + {also.map((r) => roleInfo(r).label).join(', ')}</span>
        ))}
    </span>
  );
}
