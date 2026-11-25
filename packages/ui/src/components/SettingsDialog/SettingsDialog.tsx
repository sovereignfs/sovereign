'use client';

import { type ReactNode, useId, useState } from 'react';
import { Dialog } from '../Dialog/Dialog';
import { Icon, type IconName } from '../Icon/Icon';
import { Input } from '../Input/Input';
import styles from './SettingsDialog.module.css';

export interface SettingsSection {
  id: string;
  label: string;
  icon: IconName;
  /** The section's content, shown with no heading of its own: the navigation names it. */
  content: ReactNode;
  /** The section's own address, when the app gives each one (rendered as a link with `renderLink`, or a plain `<a>`). */
  href?: string;
}

export interface SettingsGroup {
  id: string;
  sections: SettingsSection[];
}

/** Props for a consumer's own link element (Next's `<Link>`), as `NavList`'s `renderLink` receives them. */
export interface SettingsLinkProps {
  href: string;
  className: string;
  'aria-current': 'page' | undefined;
  onClick: () => void;
  children: ReactNode;
}

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** The dialog's title, shown across its width. "Settings" when not given. */
  title?: string;
  /** Sections in groups; a divider is drawn between groups. */
  groups: SettingsGroup[];
  /**
   * The section shown. `null` shows the sections alone on a phone (the first step there) and the first section on a wider
   * screen, so that the same value is right for both and nothing about the route depends on the viewport.
   */
  active: string | null;
  /** Called with a section's id when it is chosen, and with `null` by a phone's back arrow. */
  onSelect: (id: string | null) => void;
  /** A search box over the sections, filtering them by label. Off by default. */
  search?: boolean;
  /** The search box's label and placeholder. "Search settings" when not given. */
  searchLabel?: string;
  /** The back arrow's accessible name on a phone. "Back" when not given. */
  backLabel?: string;
  /** Size on a wide screen: `lg` fills the screen with a margin, `fixed` is capped. Always the whole screen on a phone. */
  size?: 'lg' | 'fixed';
  renderLink?: (section: SettingsSection, linkProps: SettingsLinkProps) => ReactNode;
}

/**
 * SettingsDialog — settings as one dialog with a side navigation, the same in core and every app.
 *
 * A title row and close across the width; on the left, sections in groups with a divider between groups, each with an
 * icon, and an optional search; on the right, the active section's content, scrolling inside a frame that never changes
 * size. On a phone it is the whole screen: the sections, then one section with a back arrow.
 *
 * Controlled: the app decides which section is shown (`active`, `onSelect`), so that it can give every section an
 * address. Framework-agnostic: links come from `renderLink`.
 */
export function SettingsDialog({
  open,
  onClose,
  title = 'Settings',
  groups,
  active,
  onSelect,
  search = false,
  searchLabel = 'Search settings',
  backLabel = 'Back',
  size = 'lg',
  renderLink,
}: SettingsDialogProps) {
  const [query, setQuery] = useState('');
  const navId = useId();
  const all = groups.flatMap((group) => group.sections);
  const shown = all.find((section) => section.id === active) ?? all[0];
  const needle = query.trim().toLocaleLowerCase();
  const visible = groups
    .map((group) => ({
      ...group,
      sections: needle
        ? group.sections.filter((section) => section.label.toLocaleLowerCase().includes(needle))
        : group.sections,
    }))
    .filter((group) => group.sections.length > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size={size}
      header={title}
      aria-label={title}
      rowClassName={styles.headerRow}
      titleClassName={styles.headerTitle}
      flush
    >
      <div className={styles.frame} data-view={active === null ? 'sections' : 'section'}>
        <div className={styles.sidebar}>
          {search && (
            <div className={styles.search}>
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchLabel}
                aria-label={searchLabel}
                aria-controls={navId}
              />
            </div>
          )}
          <nav id={navId} className={styles.nav} aria-label={title}>
            {visible.map((group) => (
              <ul key={group.id} className={styles.group}>
                {group.sections.map((section) => {
                  const current = active !== null && section.id === shown?.id;
                  const className = [styles.row, section.id === shown?.id ? styles.rowActive : '']
                    .filter(Boolean)
                    .join(' ');
                  const children = (
                    <>
                      <Icon name={section.icon} size="sm" aria-hidden className={styles.icon} />
                      <span className={styles.label}>{section.label}</span>
                      <Icon name="chevron-right" size="sm" aria-hidden className={styles.chevron} />
                    </>
                  );
                  const select = () => onSelect(section.id);
                  let row: ReactNode;
                  if (section.href !== undefined && renderLink) {
                    row = renderLink(section, {
                      href: section.href,
                      className,
                      'aria-current': current ? 'page' : undefined,
                      onClick: select,
                      children,
                    });
                  } else if (section.href !== undefined) {
                    row = (
                      <a
                        href={section.href}
                        className={className}
                        aria-current={current ? 'page' : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          select();
                        }}
                      >
                        {children}
                      </a>
                    );
                  } else {
                    row = (
                      <button
                        type="button"
                        className={className}
                        aria-current={current ? 'page' : undefined}
                        onClick={select}
                      >
                        {children}
                      </button>
                    );
                  }
                  return <li key={section.id}>{row}</li>;
                })}
              </ul>
            ))}
          </nav>
        </div>
        {shown && (
          <section className={styles.section} aria-label={shown.label}>
            <div className={styles.back}>
              <button
                type="button"
                className={styles.backButton}
                aria-label={backLabel}
                onClick={() => onSelect(null)}
              >
                <Icon name="chevron-left" size="sm" aria-hidden />
              </button>
              <span className={styles.backTitle}>{shown.label}</span>
            </div>
            <div className={styles.body}>{shown.content}</div>
          </section>
        )}
      </div>
    </Dialog>
  );
}
