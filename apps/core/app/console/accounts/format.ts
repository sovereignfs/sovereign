import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../../../src/auth/roles';

/** A role as a person reads it. */
export function roleLabel(role: string): string {
  switch (role) {
    case ROLE_OWNER:
      return 'Owner';
    case ROLE_ADMIN:
      return 'Admin';
    case ROLE_USER:
      return 'User';
    default:
      return 'Unknown';
  }
}

const TIME = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** A moment, said in UTC so a page reads the same wherever it is rendered. */
export function formatTime(milliseconds: number): string {
  return `${TIME.format(new Date(milliseconds))} UTC`;
}
