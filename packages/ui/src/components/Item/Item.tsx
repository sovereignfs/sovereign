import type { ReactNode } from 'react';
import styles from './Item.module.css';

export interface ItemProps {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /** Renders as a button when given; a plain row otherwise. */
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Item — generic row primitive: leading slot, title + optional description,
 * trailing slot. The building block for settings rows, list rows, and
 * menu-adjacent rows that don't fit `Menu`'s own item shape.
 */
export function Item({
  leading,
  title,
  description,
  trailing,
  onClick,
  disabled,
  className,
}: ItemProps) {
  const interactive = Boolean(onClick);
  const classes = [styles.root, interactive ? styles.interactive : '', className]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {leading && <span className={styles.leading}>{leading}</span>}
      <span className={styles.content}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </>
  );

  if (interactive) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={classes}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}
