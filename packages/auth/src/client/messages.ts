/** Said to someone whose account was deactivated, and to nobody else (auth.md §4, rule 6): after the password or passkey was right. */
export const DEACTIVATED = 'This account has been deactivated. Ask whoever runs this instance.';

/** What an error from an email request says to a person, or `undefined` when it is not one of the common ones. */
export function emailRequestProblem(error: { status: number; code?: string }): string | undefined {
  if (error.status === 429) return 'Too many requests. Wait a minute, then try again.';
  if (error.code === 'EMAIL_NOT_AVAILABLE') {
    return "Email isn't set up on this instance, so this can't be done yet. Ask whoever runs it.";
  }
  return undefined;
}

/** What went wrong with a passkey, in words a person can act on. */
export function passkeyProblem(error: { status: number; code?: string; message?: string }): string {
  if (error.code === 'PASSKEY_NOT_UNLOCKED' && error.message) return error.message;
  // better-auth's own refusals, the commonest cause of which is a device that did not ask for a PIN or biometrics: since 1.7.18 it
  // refuses such an answer itself, before core's check can name the cause.
  if (error.code === 'FAILED_TO_VERIFY_REGISTRATION') {
    return 'This passkey could not be added. Use a device that asks for a PIN or biometrics, then try again.';
  }
  if (error.code === 'AUTHENTICATION_FAILED') {
    return 'That did not work. Check that this device has a passkey for this site and asks for your PIN or biometrics, then try again.';
  }
  if (error.code === 'EMAIL_NOT_VERIFIED') return 'Verify your email address before signing in.';
  if (error.code === 'ACCOUNT_DEACTIVATED') return DEACTIVATED;
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return 'This device already has a passkey for this site.';
  }
  return 'That did not work. Check that this device has a passkey for this site, then try again.';
}
