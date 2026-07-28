import type { ElementType, ReactNode } from 'react';
import styles from './Typography.module.css';

export type TypographyVariant = 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'caption' | 'label';

const DEFAULT_TAG: Record<TypographyVariant, ElementType> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  body: 'p',
  caption: 'p',
  label: 'span',
};

export interface TypographyProps {
  variant: TypographyVariant;
  children: ReactNode;
  /** Override the rendered tag while keeping the variant's visual style —
   * e.g. `variant="h1" as="div"` to avoid a second `<h1>` on a page that
   * already has one. */
  as?: ElementType;
  className?: string;
}

/** Typography — text bound to the design system's font-size/weight scale. */
export function Typography({ variant, children, as, className }: TypographyProps) {
  const Tag = as ?? DEFAULT_TAG[variant];
  return <Tag className={[styles[variant], className].filter(Boolean).join(' ')}>{children}</Tag>;
}
