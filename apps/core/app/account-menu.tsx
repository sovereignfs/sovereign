'use client';

import { useState } from 'react';
import { UserMenu, type UserMenuItem } from '@sovereignfs/ui';
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
  const [, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // This browser forgets the keys it kept for the session (core-app §5.4); the session's end makes them unopenable anyway.
    await forgetKeys();
    await authClient.signOut();
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
