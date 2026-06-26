'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ConsoleNavLink({
  href,
  className,
  activeClassName,
  children,
}: {
  href: string;
  className: string | undefined;
  activeClassName: string | undefined;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = href === '/console' ? pathname === '/console' : pathname.startsWith(href);
  return (
    <Link href={href} replace className={isActive ? activeClassName : className}>
      {children}
    </Link>
  );
}
