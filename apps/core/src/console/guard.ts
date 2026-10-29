import { notFound, redirect } from 'next/navigation';
import { getSession } from '../auth/session';
import { can, type Capability } from '../roles/capabilities';
import { getCapabilityMatrix } from '../roles/matrix';
import { visibleSections, type ConsoleSection } from './sections';

/**
 * The check every Console page and its layout makes first (core-app §3.2.2): someone signed in, whose role
 * holds `console:access` and the capability the page asks for, judged by the matrix in force, read from the
 * database on this request. Someone who is not signed in is sent to sign in and back; someone who is but
 * may not is shown a page that is not there, not one that says what they lack. A layout is not enough: it is
 * not rendered again when someone moves between pages beneath it, and a server action is a public
 * endpoint, so each page checks here and each action calls `requireCapability`.
 *
 * It returns the person and the sections they may see, for the navigation.
 */
export async function requireConsole(
  capability: Capability = 'console:access',
  options: { returnTo?: string; sections?: readonly ConsoleSection[] } = {},
) {
  const session = await getSession();
  if (!session) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(options.returnTo ?? '/console')}`);
  }
  const matrix = await getCapabilityMatrix();
  if (
    !can(session.user.role, 'console:access', matrix) ||
    !can(session.user.role, capability, matrix)
  ) {
    notFound();
  }
  return { session, sections: visibleSections(session.user.role, matrix, options.sections) };
}
