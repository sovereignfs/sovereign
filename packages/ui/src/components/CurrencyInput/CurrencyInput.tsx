'use client';

import { useState } from 'react';
import { Input, type InputProps } from '../Input/Input';

export interface CurrencyInputProps extends Omit<
  InputProps,
  'value' | 'onChange' | 'type' | 'inputMode'
> {
  /** Smallest currency unit — never a float. Null when the field is empty or unparsable.
   *  How many of these make one major unit is `decimals` (hundredths by default). */
  valueCents: number | null;
  onValueChange: (cents: number | null) => void;
  /**
   * Fraction digits the currency uses — the exponent relating `valueCents` to
   * the amount on screen (`valueCents / 10 ** decimals`). Defaults to `2`, so
   * every existing caller keeps its cents behaviour unchanged.
   *
   * Not every currency is hundredths: ISO 4217 gives JPY and KRW zero digits
   * and several Gulf currencies three, and a consumer tracking BTC needs
   * eight (one satoshi is 1e-8 BTC — at two digits the smallest expressible
   * amount is 0.01 BTC, which is not a usable granularity for the asset).
   * Pass the currency's own exponent and `valueCents` stays an exact integer
   * in that currency's smallest unit, which is what keeps money out of
   * floating point everywhere else.
   */
  decimals?: number;
}

function minorToText(minor: number, decimals: number): string {
  return (minor / 10 ** decimals).toFixed(decimals);
}

function textToMinor(text: string, decimals: number): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  // Rounded, never truncated: `0.1 * 10 ** 8` is 10000000.000000002 in
  // binary floating point, and the integer is the value of record.
  return Math.round(parsed * 10 ** decimals);
}

/**
 * CurrencyInput — decimal amount entry that reports its value as an integer
 * number of the currency's smallest units, matching Sovereign's "amounts are
 * always smallest-unit integers" data-model convention (never a float in
 * application state). `decimals` says how many of those units make one major
 * unit; it defaults to 2, so a caller that doesn't pass it gets cents.
 *
 * Keeps its own text buffer rather than deriving display text from
 * `valueCents` on every keystroke — reformatting mid-type (e.g. "12." → the
 * trailing decimal point) would fight the user's cursor. It only
 * re-syncs from `valueCents` when the prop changes to something the current
 * text doesn't already represent (an external reset/prefill), so typing
 * remains uninterrupted while the parsed amount stays in lockstep with the
 * parent's state. Changing `decimals` re-syncs for the same reason: the same
 * text means a different integer once the exponent moves.
 */
export function CurrencyInput({
  valueCents,
  onValueChange,
  decimals = 2,
  ...rest
}: CurrencyInputProps) {
  const [text, setText] = useState(() =>
    valueCents != null ? minorToText(valueCents, decimals) : '',
  );

  if (textToMinor(text, decimals) !== valueCents) {
    setText(valueCents != null ? minorToText(valueCents, decimals) : '');
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
        onValueChange(textToMinor(next, decimals));
      }}
    />
  );
}
