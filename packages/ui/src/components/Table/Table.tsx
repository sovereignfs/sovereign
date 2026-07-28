import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import styles from './Table.module.css';

export interface TableProps {
  children: ReactNode;
  className?: string;
}

/**
 * Table — thin, styled wrappers around the native table elements.
 *
 * Not a data grid: no sort, filter, or virtualization. `Table` wraps its
 * content in a horizontally-scrolling container (masked-edge fade, hidden
 * scrollbar — same technique as `NavTabs`) so a table wider than its
 * container scrolls instead of overflowing the page, at any viewport size.
 */
export function Table({ children, className }: TableProps) {
  return (
    <div className={styles.scrollContainer}>
      <table className={[styles.table, className].filter(Boolean).join(' ')}>{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className={styles.head}>{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className={styles.body}>{children}</tbody>;
}

export function TableRow({ children }: { children: ReactNode }) {
  return <tr className={styles.row}>{children}</tr>;
}

export function TableHeaderCell({ children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={styles.th} {...rest}>
      {children}
    </th>
  );
}

export function TableCell({ children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={styles.td} {...rest}>
      {children}
    </td>
  );
}
