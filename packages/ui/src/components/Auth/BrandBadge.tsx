import styles from './Auth.module.css';

export interface BrandBadgeProps {
  /** The product's or instance's name; its first letter is the mark. */
  name: string;
  size?: 'md' | 'lg';
}

/** A product's mark when it has no logo: the first letter of its name in the accent colour. */
export function BrandBadge({ name, size = 'md' }: BrandBadgeProps) {
  return (
    <span
      className={size === 'lg' ? `${styles.badge} ${styles.badgeLg}` : styles.badge}
      aria-hidden="true"
    >
      {name.trim()[0]?.toUpperCase() ?? 'S'}
    </span>
  );
}
