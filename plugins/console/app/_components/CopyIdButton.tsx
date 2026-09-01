'use client';

import { useState } from 'react';
import { Icon } from '@sovereignfs/ui';
import styles from '../console.module.css';

/**
 * Small copy-to-clipboard affordance for an entity id (`.userId` truncates
 * or wraps a full UUID in a narrow detail column — this is the actual way
 * to get the value out, rather than relying on a native tooltip or
 * triple-click select-all, neither of which is discoverable). Generic over
 * entity kind — used by Users, Groups, and any other detail pane with an id
 * row, not just users despite the shared `.copyIdBtn` class's own name.
 */
export function CopyIdButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={styles.copyIdBtn}
      aria-label={label}
      title={copied ? 'Copied!' : label}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size="sm" aria-hidden />
    </button>
  );
}
