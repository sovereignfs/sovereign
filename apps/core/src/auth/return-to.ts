import { queryOf, resumeAddress } from '../oauth/signed-query';
import { safeReturnTo } from '@sovereignfs/auth';

export { safeReturnTo, withReturnTo } from '@sovereignfs/auth';

/**
 * Where a sign-in page sends the person on to: back into an app's sign-in when an app sent them here
 * (`resumeAddress`), otherwise the page they asked for.
 */
export function signInReturnTo(query: Record<string, string | string[] | undefined>): string {
  return resumeAddress(queryOf(query)) ?? safeReturnTo(query.returnTo);
}
