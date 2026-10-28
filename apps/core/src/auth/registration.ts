import type { Executor } from '@sovereignfs/database';
import { SETTINGS, type SettingsStore } from '../settings';

/**
 * Who may sign up (core-app §3.3.1). Whether sign-up needs an invite is a setting an operator can
 * change while core runs, so it is asked for on every sign-up.
 */
export type RegistrationPolicy = {
  inviteOnly(): Promise<boolean>;
};

/**
 * The policy from the instance settings: the value saved in the Console, otherwise
 * `SV_AUTH_INVITE_ONLY`, otherwise invite-only. Only an explicit `false` opens sign-up.
 */
export function registrationFrom(settings: SettingsStore): RegistrationPolicy {
  return {
    inviteOnly: async () => (await settings.value(SETTINGS.inviteOnly)) !== false,
  };
}

/** Whether no account exists yet: the next one is the first, and becomes the owner. */
export async function isFirstAccount(executor: Executor): Promise<boolean> {
  const { rows } = await executor.run('select 1 as found from users limit 1');
  return rows.length === 0;
}

export type RegistrationMode = 'first-account' | 'invite-only' | 'open';

/** What the sign-up page should tell a visitor: who can create an account right now. */
export async function registrationMode(
  executor: Executor,
  policy: RegistrationPolicy,
): Promise<RegistrationMode> {
  if (await isFirstAccount(executor)) return 'first-account';
  return (await policy.inviteOnly()) ? 'invite-only' : 'open';
}
