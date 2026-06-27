'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '../shell.module.css';

export function NavIcon({
  href,
  title,
  alsoActiveOn,
  children,
}: {
  href: string;
  title: string;
  alsoActiveOn?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    pathname.startsWith(href + '/') ||
    (alsoActiveOn?.includes(pathname) ?? false);
  return (
    <Link
      href={href}
      className={`${styles.icon} ${isActive ? styles.iconActive : ''}`}
      title={title}
      aria-current={isActive ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
