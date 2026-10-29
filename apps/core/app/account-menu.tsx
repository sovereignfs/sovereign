'use client';

import { useState } from 'react';
import { UserMenu, type UserMenuItem } from '@sovereignfs/ui';
import { authClient } from '../src/auth/client';

/**
 * The person's avatar in the header, and the menu it opens: their account, the Console for an operator, and
 * signing out. The avatar is their picture, or their initials until they have one.
 */
export function AccountMenu({
  name,
  email,
  avatarUrl,
  operator,
}: {
  name: string;
  email: string;
  avatarUrl: string | undefined;
  operator: boolean;
}) {
  const [, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    // A full navigation, so nothing of the session is left in the page.
    window.location.assign('/sign-in?signedout=1');
  }

  const items: UserMenuItem[] = [
    { label: 'Account', icon: 'user', href: '/profile' },
    ...(operator
      ? [{ label: 'Console', icon: 'layout-dashboard', href: '/console' } satisfies UserMenuItem]
      : []),
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
