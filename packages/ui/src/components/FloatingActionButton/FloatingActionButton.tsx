import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import styles from './FloatingActionButton.module.css';

export interface FloatingActionButtonProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'children' | 'aria-label' | 'onClick'
> {
  /** What it does, in words: the button is an icon, so this is its accessible name (and its text when `extended`). */
  label: string;
  /** The icon, an `<Icon>` or an app's own mark. Decorative: the label names the button. */
  icon: ReactNode;
  /** Shows the label beside the icon instead of the icon alone. */
  extended?: boolean;
  /** Makes it a link to this address instead of a button. */
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Buttons only. */
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  /** Links only. */
  rel?: string;
  target?: string;
}

/**
 * The phone's one main action (an app's _Check in_, _Add expense_): a round button that floats **above `MobileFooter`**, at the end of the line, clear of the safe area. It reads
 * `--sv-shell-footer-height`, which the footer publishes (and the platform shell sets), so it sits above the footer however tall that is, and above the home indicator when there is no footer. A
 * link when it is given an `href`, a button otherwise. Render it only on a phone: it has no breakpoint of its own, so an app decides where it belongs (`DESIGN.md` of the app).
 *
 * Presentational and RSC-safe: no state, and no `next/link`; the app passes its own `href`.
 */
export function FloatingActionButton({
  label,
  icon,
  extended = false,
  className,
  href,
  type = 'button',
  disabled,
  rel,
  target,
  ...rest
}: FloatingActionButtonProps) {
  const cls = [styles.fab, extended ? styles.extended : '', className].filter(Boolean).join(' ');
  const content = (
    <>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      {extended ? <span className={styles.label}>{label}</span> : null}
    </>
  );
  if (href !== undefined) {
    return (
      <a
        {...rest}
        href={href}
        {...(rel !== undefined ? { rel } : {})}
        {...(target !== undefined ? { target } : {})}
        className={cls}
        aria-label={label}
      >
        {content}
      </a>
    );
  }
  return (
    <button {...rest} type={type} disabled={disabled} className={cls} aria-label={label}>
      {content}
    </button>
  );
}
