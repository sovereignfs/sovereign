import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  FormHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react';
import { Button, type ButtonProps } from '../Button/Button';
import styles from './Auth.module.css';

const join = (...names: (string | undefined)[]) => names.filter(Boolean).join(' ');

/** The form of a page before sign-in: its boxes one under another. */
export function AuthForm({ className, ...rest }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={join(styles.form, className)} {...rest} />;
}

/** A button as wide as the card. A submit button sits a little apart from the box above it. */
export function AuthButton({ className, type = 'button', ...rest }: ButtonProps) {
  return (
    <Button
      type={type}
      className={join(type === 'submit' ? styles.submit : styles.wide, className)}
      {...rest}
    />
  );
}

/** The line between one way of signing in and another: "or". */
export function AuthDivider({ children = 'or' }: { children?: ReactNode }) {
  return (
    <div className={styles.divider} aria-hidden="true">
      {children}
    </div>
  );
}

/** A line of small print under the form, centred: "New to Fjord? Create account". */
export function AuthFooter({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={join(styles.footer, className)} {...rest} />;
}

/** A link inside the card's text. */
export function AuthLink({
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={join(styles.link, className)} {...rest}>
      {children}
    </a>
  );
}

/** An action that reads as a link, such as "Use a backup code". */
export function AuthLinkButton({
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={join(styles.linkButton, className)} {...rest} />;
}
