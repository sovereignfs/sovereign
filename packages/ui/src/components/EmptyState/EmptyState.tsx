import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: IconName;
  heading: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, heading, description, action, className }: EmptyStateProps) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {icon && (
        <span className={styles.icon}>
          <Icon name={icon} size="lg" aria-hidden={true} />
        </span>
      )}
      <h2 className={styles.heading}>{heading}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action}
    </div>
  );
}
