import styles from './Spinner.module.css';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const sizeClass: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: styles.sm as string,
  md: styles.md as string,
  lg: styles.lg as string,
};

export function Spinner({ size = 'md', label = 'Loading…', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={[styles.spinner, sizeClass[size], className].filter(Boolean).join(' ')}
    />
  );
}
