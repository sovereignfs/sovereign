import type { AnchorHTMLAttributes, ReactNode } from 'react';
import styles from '../Button/Button.module.css';
import type { ButtonSize, ButtonVariant } from '../Button/Button';

export type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** Where it goes. */
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  /**
   * How the link element is made, so a router's own link can be used without this package knowing the router
   * (the same way `NavTabs` takes its links). It is given every prop the anchor would have, `className` included,
   * and must pass them on. Without it, a plain `<a>` is rendered.
   */
  renderLink?: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => ReactNode;
};

/**
 * ButtonLink — a link that looks like a `Button`, for an action that goes to another page ("Add an app")
 * where a `<button>` would be the wrong element. It shares the button's styling, so the two never drift.
 * Presentational and RSC-safe.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  renderLink,
  ...rest
}: ButtonLinkProps) {
  const classes = [styles.button, styles[variant], styles[size], styles.link, className]
    .filter(Boolean)
    .join(' ');
  const props = { ...rest, className: classes, children };
  return renderLink ? (
    renderLink(props)
  ) : (
    <a {...rest} className={classes}>
      {children}
    </a>
  );
}
