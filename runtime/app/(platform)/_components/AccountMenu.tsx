'use client';

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { offline } from '@sovereignfs/sdk/offline';
import { offlineQueue } from '@sovereignfs/sdk/offline-queue';
import styles from './AccountMenu.module.css';

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first = '', second = ''] = trimmed.split(/\s+/);
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}

type HydratedUser = { name: string; email: string; image?: string };

// Deliberately *without* `disableCookieCache=true`: that flag forces
// better-auth to bypass the signed session_data cookie and hit the DB via
// findSession() on every single call. Traced with Playwright network capture
// against a live repro: under the concurrent multi-process DB load a real
// page load produces (this route, the runtime, and the auth server all
// sharing one SQLite file), that DB lookup intermittently returned nothing
// for a perfectly valid, unexpired token — better-auth then treats that as
// "no session" and responds with Set-Cookie clearing every session cookie,
// silently signing the user out. The account/profile and account/security
// pages need disableCookieCache because they must reflect a self-edit
// immediately; this hydration is just filling in the avatar/name the neutral
// SSR shell couldn't render, so the up-to-300s-stale cached snapshot is fine
// — the same staleness the rest of the shell already accepts from the
// middleware's own cookie-cache-derived headers. Reading via the cache also
// means no DB round trip at all, not just a safer one.
//
// Module-scoped and shared by every AccountMenu instance (the sidebar and
// mobile header both mount unconditionally, so both would otherwise fire
// this on mount at the same time) so only one request is ever made per page
// load, regardless of how many instances ask.
let sessionHydrationPromise: Promise<HydratedUser | null> | null = null;

function hydrateSessionOnce(): Promise<HydratedUser | null> {
  sessionHydrationPromise ??= fetch('/api/auth/get-session')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) =>
      data?.user
        ? {
            name: data.user.name ?? '',
            email: data.user.email ?? '',
            image: data.user.image ?? undefined,
          }
        : null,
    )
    .catch(() => null);
  return sessionHydrationPromise;
}

export function AccountMenu({
  avatar,
  avatarImageClassName,
  triggerClassName,
  placement,
  showConsole,
  userName,
  userEmail,
  userImage,
  hydrateUser,
}: {
  avatar: ReactNode;
  avatarImageClassName?: string;
  triggerClassName?: string;
  placement: 'sidebar' | 'header';
  showConsole?: boolean;
  userName?: string;
  userEmail?: string;
  userImage?: string;
  // The offline-route neutral shell (see runtime/app/(platform)/layout.tsx)
  // renders no per-user name/image server-side so a service-worker-cached
  // document never bakes in one user's identity for another. That's a
  // property of the *cached document*, not of a live, online tab — so once
  // mounted, fetch the real session client-side (never cached, always a live
  // network round-trip) to restore the avatar/name for the user actually
  // looking at the screen right now.
  hydrateUser?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState<{
    name: string;
    email: string;
    image?: string;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!hydrateUser) return;
    let cancelled = false;
    hydrateSessionOnce().then((result) => {
      // Best-effort — leave the neutral trigger if the fetch failed or
      // returned no session.
      if (!cancelled && result) setHydrated(result);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrateUser]);

  const effectiveName = hydrated?.name || userName;
  const effectiveEmail = hydrated?.email || userEmail;
  const effectiveImage = hydrated?.image ?? userImage;
  const triggerAvatar = hydrated ? (
    <span className={styles.avatarReveal}>
      {effectiveImage ? (
        <img src={effectiveImage} alt="" className={avatarImageClassName} />
      ) : (
        <span aria-hidden="true">{monogram(effectiveName || effectiveEmail || '')}</span>
      )}
    </span>
  ) : (
    avatar
  );

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

  const displayName = effectiveName || effectiveEmail || '';

  // Purge every plugin's offline read cache (RFC 0074) and mutation queue
  // (RFC 0078) before the session actually ends — the sole safeguard that
  // makes sdk.offline/sdk.offline-queue's plugin-only (not per-user) key
  // scoping safe on a shared device. Best-effort: form.submit() always runs
  // in `finally`, so a browser with IndexedDB disabled (or an error clearing
  // it) still signs out normally; it just leaves stale cached values for the
  // next mount of offline.clearAll() to catch up on. Uses the native,
  // non-React form.submit() (not requestSubmit) so it bypasses the React
  // onSubmit handler entirely instead of re-entering it.
  //
  // Unlike the read cache, purging the mutation queue discards any offline
  // edit the user made and hasn't yet gotten back online to sync (RFC 0078
  // §7's "riskier than RFC 0074's read purge" — worth naming, not silently
  // accepting). The RFC's recommended mitigation — a best-effort drain
  // attempt before purging when online — isn't implemented here: draining
  // needs a plugin-specific sync endpoint + request shape this platform-level
  // component has no way to know, and no plugin-registered sync callback
  // mechanism (the `sdk.offline-queue` analogue of `sdk.portability`'s
  // `provideExport()`) exists yet to make that generic. Flagged as a real,
  // deliberate gap for a future pass, not an oversight.
  async function handleSignOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await Promise.all([offline.clearAll(), offlineQueue.clearAll()]);
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
        {triggerAvatar}
      </button>
      {open ? (
        <div className={[styles.menu, styles[placement]].join(' ')} role="menu">
          {displayName ? (
            <>
              <div className={styles.userHeader}>
                <div className={styles.menuAvatar} aria-hidden="true">
                  {effectiveImage ? (
                    <img src={effectiveImage} alt="" className={styles.menuAvatarImg} />
                  ) : (
                    monogram(displayName)
                  )}
                </div>
                <div className={styles.userInfo}>
                  {effectiveName && <p className={styles.userName}>{effectiveName}</p>}
                  {effectiveEmail && <p className={styles.userEmail}>{effectiveEmail}</p>}
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
