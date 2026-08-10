'use client';

import { useState, useTransition } from 'react';
import { SegmentedControl } from '@sovereignfs/ui';
import { updateTextSizeAction } from '../actions';

const OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'larger', label: 'Larger' },
] as const;

type TextSizeValue = (typeof OPTIONS)[number]['value'];

/**
 * Segmented control for the in-app text-size preference (task 10.2). Scales
 * `--sv-text-size-scale` (`packages/ui/src/tokens/primitives.css`) via
 * `[data-text-size]` on <html> — applies instantly, then persists, mirroring
 * `ThemeControl`.
 */
export function TextSizeControl({ value }: { value: string }) {
  const [textSize, setTextSize] = useState<TextSizeValue>(
    (OPTIONS.find((o) => o.value === value)?.value ?? 'default') as TextSizeValue,
  );
  const [, startTransition] = useTransition();

  function choose(next: TextSizeValue): void {
    setTextSize(next);
    // Apply before the round-trip so the change is instant (no flash).
    if (next === 'default') {
      delete document.documentElement.dataset.textSize;
    } else {
      document.documentElement.dataset.textSize = next;
    }
    startTransition(() => {
      void updateTextSizeAction(next);
    });
  }

  return (
    <SegmentedControl
      value={textSize}
      onChange={choose}
      options={OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
      aria-label="Text size"
    />
  );
}
