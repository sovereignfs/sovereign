/** What an error from an email request says to a person, or `undefined` when it is not one of the common ones. */
export function emailRequestProblem(error: { status: number; code?: string }): string | undefined {
  if (error.status === 429) return 'Too many requests. Wait a minute, then try again.';
  if (error.code === 'EMAIL_NOT_AVAILABLE') {
    return "Email isn't set up on this instance, so this can't be done yet. Ask whoever runs it.";
  }
  return undefined;
}

/** Where the link in a verification email lands: sign-in, which sends a signed-in person on. */
export function afterVerification(returnTo: string): string {
  return returnTo === '/' ? '/sign-in' : `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

/** What went wrong with a passkey, in words a person can act on. */
export function passkeyProblem(error: { status: number; code?: string; message?: string }): string {
  if (error.code === 'PASSKEY_NOT_UNLOCKED' && error.message) return error.message;
  if (error.code === 'EMAIL_NOT_VERIFIED') return 'Verify your email address before signing in.';
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return 'This device already has a passkey for this site.';
  }
  return 'That did not work. Check that this device has a passkey for this site, then try again.';
}
