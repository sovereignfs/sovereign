'use client';

import { useRef, useState } from 'react';
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Popover } from '../Popover/Popover';
import styles from './NavigationMenu.module.css';

export interface NavigationMenuItem {
  label: string;
  /** A plain link with no flyout — mutually exclusive with `content`. */
  href?: string;
  /** Flyout panel content shown when this item is triggered. Pass a
   * function instead of a plain node when the content needs to close its
   * own flyout after an action (e.g. `Menubar`'s menu items) — it receives
   * a `close` callback. */
  content?: ReactNode | ((close: () => void) => ReactNode);
}

export interface NavigationMenuProps {
  items: NavigationMenuItem[];
  /** Renders a plain-link item's anchor. Defaults to `<a href>`, which
   * causes a full page reload — pass Next's `<Link>` (or equivalent) to
   * keep navigation client-side. */
  renderLink?: (href: string, children: ReactNode) => ReactNode;
  'aria-label'?: string;
}

/**
 * NavigationMenu — top-level nav bar where some items open a flyout panel.
 *
 * Desktop-oriented by design — a hover-triggered flyout bar has no mobile
 * equivalent (Research 0004); it renders as-is on touch rather than
 * attempting a redesign no consumer has asked for yet.
 *
 * Each flyout is its own `Popover` instance rather than one shared
 * positioned panel, reusing its collision detection per item. Once one
 * flyout is open, moving the pointer to a sibling trigger switches directly
 * to that one — standard menu-bar behavior — and ArrowLeft/ArrowRight move
 * focus between top-level triggers (a roving-tabindex bar, per the
 * WAI-ARIA menu pattern), Escape closes.
 */
export function NavigationMenu({
  items,
  renderLink,
  'aria-label': ariaLabel,
}: NavigationMenuProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: ReactKeyboardEvent, index: number) {
    if (e.key === 'Escape') {
      setOpenIndex(null);
      triggerRefs.current[index]?.focus();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const direction = e.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (index + direction + items.length) % items.length;
      triggerRefs.current[nextIndex]?.focus();
    }
  }

  return (
    <nav aria-label={ariaLabel} className={styles.nav}>
      <ul className={styles.list}>
        {items.map((item, index) => {
          if (!item.content) {
            const linkChildren = item.label;
            return (
              <li key={item.label}>
                {item.href && renderLink ? (
                  renderLink(item.href, linkChildren)
                ) : (
                  <a href={item.href} className={styles.link}>
                    {linkChildren}
                  </a>
                )}
              </li>
            );
          }

          const isOpen = openIndex === index;
          return (
            <li key={item.label}>
              <Popover
                aria-label={item.label}
                open={isOpen}
                onClose={() => setOpenIndex((current) => (current === index ? null : current))}
                trigger={
                  <button
                    ref={(el) => {
                      triggerRefs.current[index] = el;
                    }}
                    type="button"
                    className={[styles.trigger, isOpen ? styles.triggerOpen : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-expanded={isOpen}
                    onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                    onMouseEnter={() => {
                      // Once a sibling is already open, hovering another
                      // trigger switches directly to it — standard menu-bar
                      // behavior. Otherwise hovering alone does not open
                      // one; that stays an explicit click, since a nav bar
                      // (unlike HoverCard) isn't a "preview" surface.
                      setOpenIndex((current) => (current !== null ? index : current));
                    }}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                  >
                    {item.label}
                  </button>
                }
              >
                {typeof item.content === 'function'
                  ? item.content(() => setOpenIndex(null))
                  : item.content}
              </Popover>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
