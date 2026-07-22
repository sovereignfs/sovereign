'use client';

import { SegmentedControl } from '../SegmentedControl/SegmentedControl';

export type SplitMethod = 'equal' | 'amount' | 'percentage' | 'shares';

export interface SplitMethodSelectorProps {
  value: SplitMethod;
  onChange: (value: SplitMethod) => void;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

const OPTIONS: { label: string; value: SplitMethod }[] = [
  { label: 'Equal', value: 'equal' },
  { label: 'Amount', value: 'amount' },
  { label: 'Percentage', value: 'percentage' },
  { label: 'Shares', value: 'shares' },
];

/**
 * SplitMethodSelector — the four-way equal/amount/percentage/shares picker
 * shared by any plugin that splits a cost between people. A thin
 * `SegmentedControl` preset: centralizes the option list and labels so every
 * expense-splitting plugin presents the same four choices in the same order,
 * instead of each one re-typing its own copy of this array.
 */
export function SplitMethodSelector({
  value,
  onChange,
  size = 'sm',
  'aria-label': ariaLabel = 'Split method',
}: SplitMethodSelectorProps) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={OPTIONS}
      size={size}
      aria-label={ariaLabel}
    />
  );
}
