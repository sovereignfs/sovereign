'use client';

import { useState } from 'react';
import type { IconName } from '../Icon/Icon';
import { MenuEntries, type MenuItem } from '../Menu/Menu';
import { Popover } from '../Popover/Popover';
import styles from './UserMenu.module.css';

export interface UserMenuItem {
  label: string;
  icon: IconName;
  /** Optional when `href` is provided (a pure navigation entry needs no
   *  extra callback). Required otherwise (e.g. "Sign out"). */
  onSelect?: () => void;
  /** Renders the entry as a link (`<a href>`) instead of a button — same
   *  href-vs-onClick convention as `MobileAppsDrawer`'s items. */
  href?: string;
  destructive?: boolean;
}

export interface UserMenuProps {
  name?: string;
  email?: string;
  avatarUrl?: string;
  items: UserMenuItem[];
  /** Trigger button's accessible label. Defaults to "Account". */
  'aria-label'?: string;
  align?: 'left' | 'right';
  /** Trigger avatar size: `'md'` (36px) matches the platform sidebar's own
   *  `.avatar` exactly — the default, for that context. `'sm'` (32px) suits
   *  the more compact `Header` top-bar context instead. The panel's own
   *  user-info avatar (38px) is unaffected either way — only the trigger
   *  scales. */
  size?: 'sm' | 'md';
}

function initials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '?';
  const [first = '', second = ''] = trimmed.split(/\s+/);
  return (second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)).toUpperCase();
}

/**
 * UserMenu — the account avatar trigger + dropdown, generalized from the
 * runtime shell's own `AccountMenu.tsx` (the real, currently-shipped
 * component that every `shell: minimal` plugin would otherwise have to
 * hand-rebuild locally instead of importing). Same visual structure and
 * copy: an accent-filled avatar trigger (36px, matching the sidebar's own
 * `.avatar`), a name+email header block (38px avatar) above a divider, then
 * a plain item list.
 *
 * Presentational only — no auth/session/routing logic of its own. The
 * consumer supplies `items`, each with its own `onSelect` and/or `href`,
 * matching `MobileHeader`'s "consumer wires it up" boundary; a real
 * "Sign out" is just an item whose `onSelect` does whatever the consuming
 * app's sign-out actually requires. Built on the shared `Popover` primitive
 * (self-contained open state, matching the original's own architecture)
 * rather than a hand-rolled outside-click/Escape listener — the original
 * `AccountMenu` and every plugin-local rebuild of it independently re-derive
 * that same logic; one primitive here means one implementation to get
 * right. Always a small anchored dropdown, never a full-width sheet —
 * this is deliberately not built on the adaptive `Menu` component (which
 * becomes a bottom `Drawer` on mobile): the real account menu is a compact
 * floating panel on every surface, mobile included.
 */
export function UserMenu({
  name,
  email,
  avatarUrl,
  items,
  'aria-label': ariaLabel = 'Account',
  align = 'right',
  size = 'md',
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const displayName = name || email || '';

  return (
    <Popover
      align={align}
      width={240}
      aria-label={ariaLabel}
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={[styles.trigger, size === 'sm' ? styles.triggerSm : '']
            .filter(Boolean)
            .join(' ')}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className={styles.triggerImg} />
          ) : (
            initials(displayName)
          )}
        </button>
      }
    >
      {displayName && (
        <div className={styles.panelHeader}>
          <div className={styles.userHeader}>
            <span className={styles.menuAvatar} aria-hidden="true">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className={styles.menuAvatarImg} />
              ) : (
                initials(displayName)
              )}
            </span>
            <span className={styles.userInfo}>
              {name && <span className={styles.userName}>{name}</span>}
              {email && <span className={styles.userEmail}>{email}</span>}
            </span>
          </div>
          <hr className={styles.divider} />
        </div>
      )}
      <MenuEntries
        items={items}
        onSelect={(entry: MenuItem) => {
          setOpen(false);
          entry.onSelect?.();
        }}
      />
    </Popover>
  );
}
