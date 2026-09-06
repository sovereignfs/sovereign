import { Badge } from '@sovereignfs/ui';

/**
 * One place that maps Console's domain states to `Badge` — so "enabled"
 * isn't a role badge on one page and a status badge on another, and the
 * status vocabulary (Active / Deactivated / Invited, Enabled / Disabled)
 * reads the same everywhere.
 */
export type MemberStatus = 'active' | 'deactivated' | 'invited';

const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  active: 'Active',
  deactivated: 'Deactivated',
  invited: 'Invited',
};

export function MemberStatusBadge({
  status,
  size = 'sm',
}: {
  status: MemberStatus;
  size?: 'xs' | 'sm' | 'md';
}) {
  return (
    <Badge variant="status" size={size} status={status}>
      {MEMBER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'platform:owner':
      return 'Owner';
    case 'platform:admin':
      return 'Admin';
    case 'platform:auditor':
      return 'Auditor';
    default:
      return 'User';
  }
}

export function RoleBadge({
  role,
  size = 'sm',
}: {
  role: string | null;
  size?: 'xs' | 'sm' | 'md';
}) {
  return (
    <Badge variant="role" size={size}>
      {roleLabel(role)}
    </Badge>
  );
}

export function AppEnabledBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge variant="status" size="sm" status="active">
      Enabled
    </Badge>
  ) : (
    <Badge variant="status" size="sm" status="deactivated">
      Disabled
    </Badge>
  );
}
