import { ROLE_ADMIN, ROLE_USER } from '../auth/roles';
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  DEFAULT_MATRIX,
  type Capability,
  type Matrix,
} from './capabilities';

/**
 * What each capability is called to the owner who edits them (core-app §3.2.3). The names in code
 * (`user:manage`) stay in code; the Console says what a person can do.
 */
export const CAPABILITY_TEXT: Record<Capability, { label: string; description: string }> = {
  'profile:manage': {
    label: 'Manage their own account',
    description:
      'Change their own name, picture, password, two-factor sign-in, preferences and connected apps.',
  },
  'launcher:access': {
    label: 'Use the app launcher',
    description: 'See the apps they can open and open them.',
  },
  'console:access': {
    label: 'Open the Console',
    description: 'Enter the Console. Without this, nothing else in the Console is reachable.',
  },
  'user:view': {
    label: 'See the list of accounts',
    description: 'Look at who has an account and their details.',
  },
  'user:manage': {
    label: 'Manage accounts',
    description:
      'Invite people, deactivate, reactivate and delete accounts, and reset two-factor sign-in.',
  },
  'client:manage': {
    label: 'Manage apps',
    description:
      'Add apps that sign in with this instance, edit them, disable them and delete them.',
  },
  'instance:view': {
    label: 'See the instance’s settings',
    description: 'Look at its name, logo, sign-up setting and whether email is set up.',
  },
  'instance:configure': {
    label: 'Change the instance’s settings',
    description: 'Change its name, logo, favicon and who can sign up.',
  },
  'instance:configure-secrets': {
    label: 'Set up email sending',
    description: 'See and change how email is sent, including its password.',
  },
  'role:assign': {
    label: 'Make people admins',
    description: 'Change an account between admin and ordinary user.',
  },
  'capability:configure': {
    label: 'Change what roles can do',
    description: 'Edit this page.',
  },
  'ownership:transfer': {
    label: 'Hand over ownership',
    description: 'Make an admin the owner of this instance.',
  },
};

export type MatrixRow = {
  capability: Capability;
  label: string;
  description: string;
  /** Held by the owner alone: shown, and never given to another role. */
  ownerOnly: boolean;
  admin: boolean;
  user: boolean;
  /** What the code grants by default, for showing what the owner changed. */
  adminDefault: boolean;
  userDefault: boolean;
};

/** The matrix in force as the owner's editor shows it, one row for each capability, in the order they are defined. */
export function describeMatrix(matrix: Matrix): MatrixRow[] {
  return ALL_CAPABILITIES.map((capability) => ({
    capability,
    ...CAPABILITY_TEXT[capability],
    ownerOnly: CAPABILITIES[capability].ownerOnly,
    admin: matrix[ROLE_ADMIN].has(capability),
    user: matrix[ROLE_USER].has(capability),
    adminDefault: DEFAULT_MATRIX[ROLE_ADMIN].has(capability),
    userDefault: DEFAULT_MATRIX[ROLE_USER].has(capability),
  }));
}
