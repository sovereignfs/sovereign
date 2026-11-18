'use client';

import { useRef } from 'react';
import { UserMenu, useToast, type UserMenuItem } from '@sovereignfs/ui';
import { authClient } from '../src/auth/client';
import { forgetKeys } from '../src/keys/session';

/**
 * The person's avatar in the header, and the menu it opens: their account and signing out. An operator reaches
 * the Console from its tile on the launcher. The avatar is their picture, or their initials until they have one.
 */
export function AccountMenu({
  name,
  email,
  avatarUrl,
}: {
  name: string;
  email: string;
  avatarUrl: string | undefined;
}) {
  const toast = useToast();
  // One sign-out at a time: a second click while the first is on its way does nothing.
  const signingOut = useRef(false);

  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    // This browser forgets the keys it kept for the session (core-app §5.4); the session's end makes them unopenable anyway, and
    // if it does not end they open again with the password.
    await forgetKeys();
    const ended = await authClient.signOut().then(
      (result) => !result.error,
      () => false,
    );
    if (!ended) {
      // The session is still open: the sign-in page would only send the person back here, as if nothing had happened.
      signingOut.current = false;
      toast.show({
        title: 'You are still signed in',
        message: 'Signing out did not go through. Check your connection and try again.',
        category: 'error',
      });
      return;
    }
    // A full navigation, so nothing of the session is left in the page.
    window.location.assign('/sign-in?signedout=1');
  }

  const items: UserMenuItem[] = [
    { label: 'Account', icon: 'user', href: '/profile' },
    { label: 'Sign out', icon: 'log-out', onSelect: () => void signOut() },
  ];

  return (
    <UserMenu
      name={name}
      email={email}
      {...(avatarUrl ? { avatarUrl } : {})}
      items={items}
      aria-label="Your account"
    />
  );
}
