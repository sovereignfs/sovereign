'use client';

import { useEffect, useState } from 'react';
import { SegmentedControl } from '@sovereignfs/ui';
import { readThemeChoice, setThemeChoice, type ThemeChoice } from '../../src/theme';
import styles from '../security/security.module.css';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

/**
 * Light, dark, or whatever the system says, for core on this device. It applies as it is chosen and needs no saving:
 * it is kept in this browser and goes nowhere else, so another device keeps its own.
 */
export function AppearanceChoice() {
  // Known only in the browser, so it is read after the first render, never during it.
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useEffect(() => setChoice(readThemeChoice()), []);

  return (
    <div className={styles.form}>
      <h2 className={styles.heading}>Appearance</h2>
      <div className={styles.row}>
        <SegmentedControl
          aria-label="Appearance"
          options={[...OPTIONS]}
          value={choice}
          onChange={(next) => {
            setChoice(next);
            setThemeChoice(next);
          }}
        />
      </div>
      <p className={styles.footer}>
        {choice === 'system'
          ? 'Follows your device: light by day and dark at night, if it is set to.'
          : `Always ${choice} on this device.`}{' '}
        Another device keeps its own choice.
      </p>
    </div>
  );
}
