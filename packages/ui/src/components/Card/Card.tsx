import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'article' | 'li';
  interactive?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const paddingClass: Record<NonNullable<CardProps['padding']>, string> = {
  sm: styles.paddingSm as string,
  md: styles.paddingMd as string,
  lg: styles.paddingLg as string,
};

export function Card({
  as: Tag = 'div',
  interactive = false,
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps) {
  const cls = [styles.card, paddingClass[padding], interactive && styles.interactive, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
