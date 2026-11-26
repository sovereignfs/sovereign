import { isResumeAddress } from '../oauth/signed-query';
import { isKitDue } from './session';

/** Core's page that shows the recovery kit (core-app §5.3), which goes on to `returnTo` once it is kept. */
export const kitAddress = (returnTo: string): string =>
  `/keys/kit?returnTo=${encodeURIComponent(returnTo)}`;

/**
 * Whether an app's sign-in can be made again after the kit, with nothing more asked of the person: core holds its request, and the
 * request does not say how recent the sign-in must be (`max_age`).
 */
const canBeMadeAgain = (returnTo: string): boolean =>
  isResumeAddress(returnTo) &&
  !new URLSearchParams(returnTo.slice(returnTo.indexOf('?'))).has('max_age');

/**
 * Where someone goes once signed in or signed up: to their recovery kit first, while it is still to be kept and this browser holds
 * their keys open (core-app §5.3); otherwise on. A browser left locked is never held up: it could not keep the kit.
 *
 * `returnTo` is the page's own, which for an app's sign-in is the app's request again (`resumeAddress`). The provider's answer
 * (`continuation`) carries a code or a signed request that lasts ten minutes, so it is not carried past the kit: the app's request is
 * made again afterwards. Where it cannot be (it was too long to keep, or making it again could ask for the password again), the kit
 * waits for another time.
 */
export async function afterSigningIn(
  returnTo: string,
  continuation: string | undefined,
): Promise<string> {
  const onward = continuation ?? returnTo;
  if (continuation !== undefined && !canBeMadeAgain(returnTo)) return onward;
  return (await isKitDue()) ? kitAddress(returnTo) : onward;
}
