'use client';

import { useState } from 'react';
import { Input, type InputProps } from '../Input/Input';

export interface CurrencyInputProps extends Omit<
  InputProps,
  'value' | 'onChange' | 'type' | 'inputMode'
> {
  /** Smallest currency unit (cents) — never a float. Null when the field is empty or unparsable. */
  valueCents: number | null;
  onValueChange: (cents: number | null) => void;
}

function centsToText(cents: number): string {
  return (cents / 100).toFixed(2);
}

function textToCents(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

/**
 * CurrencyInput — decimal amount entry that reports its value as integer
 * cents, matching Sovereign's "amounts are always smallest-unit integers"
 * data-model convention (never a float in application state).
 *
 * Keeps its own text buffer rather than deriving display text from
 * `valueCents` on every keystroke — reformatting mid-type (e.g. "12." → the
 * trailing decimal point) would fight the user's cursor. It only
 * re-syncs from `valueCents` when the prop changes to something the current
 * text doesn't already represent (an external reset/prefill), so typing
 * remains uninterrupted while the parsed amount stays in lockstep with the
 * parent's state.
 */
export function CurrencyInput({ valueCents, onValueChange, ...rest }: CurrencyInputProps) {
  const [text, setText] = useState(() => (valueCents != null ? centsToText(valueCents) : ''));

  if (textToCents(text) !== valueCents) {
    setText(valueCents != null ? centsToText(valueCents) : '');
  }

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const next = e.currentTarget.value;
        setText(next);
        onValueChange(textToCents(next));
      }}
    />
  );
}
