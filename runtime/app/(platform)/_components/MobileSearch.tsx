'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import styles from './MobileSearch.module.css';

interface PluginEntry {
  id: string;
  name: string;
  routePrefix: string;
  iconUrl?: string;
}

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const [first = '', second = ''] = trimmed.split(/\s+/);
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}

export function MobileSearch({
  open,
  onClose,
  plugins,
  footerRef,
}: {
  open: boolean;
  onClose: () => void;
  plugins: PluginEntry[];
  /** The footer nav element (MobileNav's sibling `<nav>`) — measured directly
   *  for its real rendered height; see the viewport effect below for why. */
  footerRef: RefObject<HTMLElement | null>;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when overlay opens; clear query on close.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery('');
    }
  }, [open]);

  // Ref-counted scroll lock — compatible with Dialog/Drawer using the same counter.
  useEffect(() => {
    if (!open) return;
    const count = parseInt(document.body.dataset.scrollLocks ?? '0', 10);
    document.body.dataset.scrollLocks = String(count + 1);
    if (count === 0) document.body.style.overflowY = 'hidden';
    return () => {
      const next = Math.max(0, parseInt(document.body.dataset.scrollLocks ?? '0', 10) - 1);
      document.body.dataset.scrollLocks = String(next);
      if (next === 0) document.body.style.overflowY = '';
    };
  }, [open]);

  // Esc key dismisses.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Track the visual viewport so the overlay shrinks above the iOS soft keyboard.
  // The overlay's CSS `bottom` is relative to the layout viewport, which does not
  // shrink when the keyboard appears. The keyboard renders as a native layer on
  // top of the web view, leaving dead empty space between the results and the
  // keyboard. Adjusting `bottom` to match the keyboard height closes that gap.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const el = overlayRef.current;
    if (!vv || !el) return;

    const update = () => {
      const keyboardHeight = window.innerHeight - (vv.offsetTop + vv.height);
      // Measure the footer nav's own real rendered height (includes
      // safe-area-inset-bottom on devices with a home indicator) rather than
      // reading --sv-shell-footer-height via getComputedStyle + parseFloat:
      // that variable's value is a CSS calc() *expression string* (e.g.
      // "calc(\n 60px + max(0px, env(safe-area-inset-bottom) - 8px)\n)"),
      // which parseFloat cannot evaluate — it silently returns NaN, so
      // `|| 60` always won, permanently ignoring the safe-area inset and
      // under-reserving space below the overlay on notched/home-indicator
      // iPhones. getBoundingClientRect().height reflects the fully-resolved
      // layout regardless of how the CSS computed it.
      const footerHeight = footerRef.current?.getBoundingClientRect().height ?? 60;
      el.style.bottom = `${Math.max(footerHeight, keyboardHeight)}px`;
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      el.style.bottom = '';
    };
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const results = q ? plugins.filter((p) => p.name.toLowerCase().includes(q)) : plugins;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Search apps"
    >
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          aria-label="Close search"
          onClick={onClose}
        >
          <Icon name="chevron-left" size="md" aria-hidden />
        </button>
        <span className={styles.title}>Search</span>
      </div>

      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          placeholder="Search apps…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search apps"
          className={styles.searchInput}
        />
      </div>

      <div className={styles.results}>
        {results.length === 0 ? (
          <p className={styles.empty}>No apps found</p>
        ) : (
          <ul className={styles.resultList}>
            {results.map((plugin) => (
              <li key={plugin.id}>
                <Link href={plugin.routePrefix} className={styles.resultItem} onClick={onClose}>
                  <span className={styles.pluginIcon} aria-hidden="true">
                    {plugin.iconUrl ? (
                      <img src={plugin.iconUrl} alt="" className={styles.pluginIconImg} />
                    ) : (
                      monogram(plugin.name)
                    )}
                  </span>
                  <span className={styles.pluginName}>{plugin.name}</span>
                  <Icon name="chevron-right" size="sm" aria-hidden className={styles.chevron} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
