'use client';

import type { ReactNode } from 'react';
import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import { ResponsiveSurface } from '../ResponsiveSurface/ResponsiveSurface';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional icon rendered inline before the title text, on both breakpoints — e.g. `folder-open` next to a folder's name. */
  icon?: IconName;
  /**
   * Page-level controls — anywhere from one button to a whole toolbar.
   * Renders on both breakpoints unchanged; if it needs to look different on
   * mobile (e.g. collapsing into its own "⋮" trigger), that's the action
   * content's own responsibility — same pattern Shopper's `ListHeaderActions`
   * already follows (it calls `useIsMobile()` internally). `PageHeader`
   * itself has no opinion on what's inside this slot.
   */
  action?: ReactNode;
  className?: string;
  /** Heading level for the title. Defaults to `1` for standalone use; pass
   * `2` or `3` when the page already sits under a shell/plugin `<h1>`, to
   * avoid a duplicate top-level heading. Visual style is unchanged at every
   * level — only the rendered tag changes. Applies on both breakpoints. */
  headingLevel?: 1 | 2 | 3;
  /** Mobile only — shows a back button (calling this) to the left of the
   *  title when provided. Omit it to render without one. */
  onBack?: () => void;
  /** Mobile only — shows a vertical-ellipsis icon button (calling this) at
   *  the far right when provided, typically to open a drawer/menu. PageHeader
   *  has no opinion on what that menu contains — it only renders the trigger
   *  and calls back. Separate from `action`, which renders identically on
   *  both breakpoints; this is a mobile-only affordance with no web
   *  equivalent. */
  onMenuClick?: () => void;
}

const HEADING_TAG = { 1: 'h1', 2: 'h2', 3: 'h3' } as const;

interface PageHeaderWebProps {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
  headingLevel: 1 | 2 | 3;
  className?: string;
}

// internal — not exported
function PageHeaderWeb({
  title,
  description,
  icon,
  action,
  headingLevel,
  className,
}: PageHeaderWebProps) {
  const Heading = HEADING_TAG[headingLevel];
  return (
    <header className={[styles.header, className].filter(Boolean).join(' ')}>
      <div className={styles.text}>
        <div className={styles.titleRow}>
          {icon && <Icon name={icon} size="lg" aria-hidden={true} />}
          <Heading className={styles.title}>{title}</Heading>
        </div>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </header>
  );
}

interface PageHeaderMobileProps {
  title: string;
  icon?: IconName;
  action?: ReactNode;
  headingLevel: 1 | 2 | 3;
  onBack?: () => void;
  onMenuClick?: () => void;
  className?: string;
}

// internal — not exported
// No `description` here, deliberately — matches the one real mobile
// page-header precedent this was generalized from (Kanban's own
// MobileBoardHeader), which has no subtitle handling either. A single
// fixed-shape row, consistent with every other mobile chrome bar in this
// design system rather than a variable-height two-line header.
function PageHeaderMobile({
  title,
  icon,
  action,
  headingLevel,
  onBack,
  onMenuClick,
  className,
}: PageHeaderMobileProps) {
  const Heading = HEADING_TAG[headingLevel];
  return (
    <header className={[styles.mobileHeader, className].filter(Boolean).join(' ')}>
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Back"
          onClick={onBack}
          className={styles.mobileBack}
        >
          <Icon name="circle-chevron-left" size="md" aria-hidden />
        </Button>
      )}
      {icon && <Icon name={icon} size="md" aria-hidden={true} className={styles.mobileTitleIcon} />}
      <Heading className={styles.mobileTitle}>{title}</Heading>
      {action && <div className={styles.mobileAction}>{action}</div>}
      {onMenuClick && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Menu"
          onClick={onMenuClick}
          className={styles.mobileMenu}
        >
          <Icon name="ellipsis-vertical" size="md" aria-hidden />
        </Button>
      )}
    </header>
  );
}

/**
 * PageHeader — a page's title section. Web: title + description on the
 * left, action on the right. Mobile: an optional back button, a single-line
 * title, and the same action slot — a compact single row, matching Kanban's
 * own hand-rolled MobileBoardHeader this was generalized from. The
 * web/mobile fork is `ResponsiveSurface` — only one tree is ever mounted.
 */
export function PageHeader({
  title,
  description,
  icon,
  action,
  className,
  headingLevel = 1,
  onBack,
  onMenuClick,
}: PageHeaderProps) {
  return (
    <ResponsiveSurface
      web={
        <PageHeaderWeb
          title={title}
          description={description}
          icon={icon}
          action={action}
          headingLevel={headingLevel}
          className={className}
        />
      }
      mobile={
        <PageHeaderMobile
          title={title}
          icon={icon}
          action={action}
          headingLevel={headingLevel}
          onBack={onBack}
          onMenuClick={onMenuClick}
          className={className}
        />
      }
    />
  );
}
