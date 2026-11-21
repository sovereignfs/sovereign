/** How an app signs people in (auth.md §5): its own accounts, core, or both, and who may make an account of its own. */
export type WaysIn = {
  /** The app's own accounts: a password, the second step, passkeys. */
  local: boolean;
  /** Core as a way in: its address, when one is set. */
  core: string | undefined;
  /** Who may make an account of the app's own (`AUTH_SIGNUP`). `invite` needs the app's own check, and is `closed` without one. */
  signUp: 'open' | 'closed' | 'invite';
};

/** A setting that is wrong, said before the app starts. */
export class WaysInError extends Error {
  override name = 'WaysInError';
}

/**
 * The ways in, from the app's settings as text (`<P>_AUTH_LOCAL`, `<P>_AUTH_SIGNUP`, `<P>_CORE_URL`), with auth.md §5's defaults:
 * own accounts on when there is no core and off when there is; sign-up `open` when core is the only way in and `closed` otherwise. An app
 * with neither way in is refused, and so is a value that is not one of the contract's (`AUTH_LOCAL` is exactly `true` or `false`).
 */
export function resolveWaysIn(settings: {
  local?: string | undefined;
  signUp?: string | undefined;
  coreUrl?: string | undefined;
}): WaysIn {
  const core = settings.coreUrl?.trim() || undefined;
  let local: boolean;
  if (settings.local === undefined || settings.local === '') local = core === undefined;
  else if (settings.local === 'true') local = true;
  else if (settings.local === 'false') local = false;
  else throw new WaysInError('AUTH_LOCAL must be true or false.');
  if (!local && core === undefined) {
    throw new WaysInError(
      'The app has no way in: set CORE_URL, or AUTH_LOCAL=true for accounts of its own.',
    );
  }
  const signUp = settings.signUp?.trim() || (core !== undefined && !local ? 'open' : 'closed');
  if (signUp !== 'open' && signUp !== 'closed' && signUp !== 'invite') {
    throw new WaysInError('AUTH_SIGNUP must be open, closed or invite.');
  }
  return { local, core, signUp };
}
