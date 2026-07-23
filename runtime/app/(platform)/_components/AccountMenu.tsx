'use client';

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { offline } from '@sovereignfs/sdk/offline';
import styles from './AccountMenu.module.css';

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first = '', second = ''] = trimmed.split(/\s+/);
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}

export function AccountMenu({
  avatar,
  triggerClassName,
  placement,
  showConsole,
  userName,
  userEmail,
  userImage,
}: {
  avatar: ReactNode;
  triggerClassName?: string;
  placement: 'sidebar' | 'header';
  showConsole?: boolean;
  userName?: string;
  userEmail?: string;
  userImage?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const displayName = userName || userEmail || '';

  // Purge every plugin's offline cache (RFC 0072) before the session actually
  // ends — the sole safeguard that makes sdk.offline's plugin-only (not
  // per-user) key scoping safe on a shared device. Best-effort: form.submit()
  // always runs in `finally`, so a browser with IndexedDB disabled (or an
  // error clearing it) still signs out normally; it just leaves stale cached
  // values for the next mount of offline.clearAll() to catch up on. Uses the
  // native, non-React form.submit() (not requestSubmit) so it bypasses the
  // React onSubmit handler entirely instead of re-entering it.
  async function handleSignOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await offline.clearAll();
    } finally {
      form.submit();
    }
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label="Account"
        title="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {avatar}
      </button>
      {open ? (
        <div className={[styles.menu, styles[placement]].join(' ')} role="menu">
          {displayName ? (
            <>
              <div className={styles.userHeader}>
                <div className={styles.menuAvatar} aria-hidden="true">
                  {userImage ? (
                    <img src={userImage} alt="" className={styles.menuAvatarImg} />
                  ) : (
                    monogram(displayName)
                  )}
                </div>
                <div className={styles.userInfo}>
                  {userName && <p className={styles.userName}>{userName}</p>}
                  {userEmail && <p className={styles.userEmail}>{userEmail}</p>}
                </div>
              </div>
              <hr className={styles.divider} />
            </>
          ) : null}
          <Link
            href="/account"
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >
            <Icon name="user" size="sm" aria-hidden />
            Account
          </Link>
          <Link
            href="/account/preferences"
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >
            <Icon name="sliders-horizontal" size="sm" aria-hidden />
            Preferences
          </Link>
          {showConsole && (
            <Link
              href="/console"
              role="menuitem"
              className={styles.item}
              onClick={() => setOpen(false)}
            >
              <Icon name="settings" size="sm" aria-hidden />
              Console
            </Link>
          )}
          <hr className={styles.divider} />
          <form action="/api/account/logout" method="post" onSubmit={handleSignOut}>
            <button
              type="submit"
              role="menuitem"
              className={`${styles.item} ${styles.itemDestructive}`}
            >
              <Icon name="log-out" size="sm" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
