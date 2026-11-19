/** The sign-in's messages are the sign-in package's (auth.md §7), the same in core and every app. */
export { DEACTIVATED, emailRequestProblem, passkeyProblem } from '@sovereignfs/auth/client';

/** Where the link in a verification email lands: sign-in, which sends a signed-in person on. */
export function afterVerification(returnTo: string): string {
  return returnTo === '/' ? '/sign-in' : `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}
