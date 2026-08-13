import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Heading level for the title. Defaults to `1` for standalone use; pass
   * `2` or `3` when the page already sits under a shell/plugin `<h1>`, to
   * avoid a duplicate top-level heading. Visual style is unchanged at every
   * level — only the rendered tag changes. */
  headingLevel?: 1 | 2 | 3;
}

const HEADING_TAG = { 1: 'h1', 2: 'h2', 3: 'h3' } as const;

export function PageHeader({
  title,
  description,
  action,
  className,
  headingLevel = 1,
}: PageHeaderProps) {
  const Heading = HEADING_TAG[headingLevel];
  return (
    <header className={[styles.header, className].filter(Boolean).join(' ')}>
      <div className={styles.text}>
        <Heading className={styles.title}>{title}</Heading>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </header>
  );
}
