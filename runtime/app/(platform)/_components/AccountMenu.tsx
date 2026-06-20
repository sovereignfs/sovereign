'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './AccountMenu.module.css';

/**
 * Shell account control (PLT-11): the avatar opens a small popover menu with an
 * Account link and Log out, replacing the bare avatar link. Log out is a plain
 * form POST to the runtime logout route, so it works without JS; the menu's
 * open/close is the only JS-dependent layer. Keyboard-accessible: the trigger
 * exposes `aria-expanded`, Esc closes and restores focus, and a click (or focus
 * moving) outside dismisses it.
 */
export function AccountMenu({
  avatar,
  triggerClassName,
  placement,
  showConsole,
}: {
  avatar: ReactNode;
  triggerClassName?: string;
  /** Where the popover opens relative to the trigger. */
  placement: 'sidebar' | 'header';
  /** Show a Console link in the menu (shown to admins on mobile header). */
  showConsole?: boolean;
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
          <Link
            href="/account"
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >
            Account
          </Link>
          {showConsole ? (
            <Link
              href="/console"
              role="menuitem"
              className={styles.item}
              onClick={() => setOpen(false)}
            >
              Console
            </Link>
          ) : null}
          <form action="/api/account/logout" method="post">
            <button type="submit" role="menuitem" className={styles.item}>
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
