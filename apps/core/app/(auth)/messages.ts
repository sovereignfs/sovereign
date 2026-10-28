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
