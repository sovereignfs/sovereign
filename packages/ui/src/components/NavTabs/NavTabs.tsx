import styles from './NavTabs.module.css';

export interface NavTabItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface NavTabsProps {
  items: NavTabItem[];
  className?: string;
  'aria-label'?: string;
}

export function NavTabs({ items, className, 'aria-label': ariaLabel }: NavTabsProps) {
  return (
    <nav
      className={[styles.nav, className].filter(Boolean).join(' ')}
      aria-label={ariaLabel ?? 'Page navigation'}
    >
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={[styles.link, item.active && styles.active].filter(Boolean).join(' ')}
          aria-current={item.active ? 'page' : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
