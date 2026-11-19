import type { AnchorHTMLAttributes, ReactNode } from 'react';

/** How a link is drawn: the consumer's router link, or a plain `<a>` when none is given. */
export type AuthLinkRenderer = (
  props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string },
) => ReactNode;

export const plainLink: AuthLinkRenderer = ({ children, ...props }) => <a {...props}>{children}</a>;
