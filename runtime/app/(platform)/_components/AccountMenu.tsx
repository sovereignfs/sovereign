'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
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
          <form action="/api/account/logout" method="post">
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
