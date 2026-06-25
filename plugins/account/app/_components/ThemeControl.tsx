'use client';

import { useState, useTransition } from 'react';
import { SegmentedControl } from '@sovereignfs/ui';
import { updateThemeAction } from '../actions';

const OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

type ThemeValue = (typeof OPTIONS)[number]['value'];

/** Resolve a theme choice to the concrete attribute, following the OS for `system`. */
function resolve(theme: string): 'light' | 'dark' {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Segmented control for appearance (ACC-08) — applies instantly, then persists. */
export function ThemeControl({ value }: { value: string }) {
  const [theme, setTheme] = useState<ThemeValue>(
    (OPTIONS.find((o) => o.value === value)?.value ?? 'system') as ThemeValue,
  );
  const [, startTransition] = useTransition();

  function choose(next: ThemeValue): void {
    setTheme(next);
    // Apply before the round-trip so the change is instant (no flash).
    document.documentElement.dataset.theme = resolve(next);
    startTransition(() => {
      void updateThemeAction(next);
    });
  }

  return (
    <SegmentedControl
      value={theme}
      onChange={choose}
      options={OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
      aria-label="Appearance"
    />
  );
}
