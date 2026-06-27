'use client';

import { useState } from 'react';
import styles from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

const sizeClass: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: styles.sm as string,
  md: styles.md as string,
  lg: styles.lg as string,
};

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const cls = [styles.avatar, sizeClass[size], className].filter(Boolean).join(' ');

  if (src && !imgFailed) {
    return (
      <span className={cls} aria-label={name}>
        <img src={src} alt={name} className={styles.img} onError={() => setImgFailed(true)} />
      </span>
    );
  }

  return (
    <span className={cls} aria-label={name}>
      {initials(name)}
    </span>
  );
}
