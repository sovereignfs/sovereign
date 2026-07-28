import type { ReactNode } from 'react';
import styles from './Kbd.module.css';

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/** Kbd — inline keyboard-key styling. Renders a real `<kbd>` element. */
export function Kbd({ children, className }: KbdProps) {
  return <kbd className={[styles.kbd, className].filter(Boolean).join(' ')}>{children}</kbd>;
}
