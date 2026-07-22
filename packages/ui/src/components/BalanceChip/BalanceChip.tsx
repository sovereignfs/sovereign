import styles from './BalanceChip.module.css';

export interface BalanceChipProps {
  /** Smallest currency unit (cents). Positive = owed to them, negative = they owe, zero = settled. */
  amountCents: number;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  className?: string;
}

function formatAbsCents(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}

/**
 * BalanceChip — inline balance indicator (green = owed to them, red = they
 * owe, neutral = settled up). For any plugin tracking who-owes-whom — not
 * Tally-specific despite the naming; "amountCents" is a generic signed net
 * balance, not tied to expense-splitting semantics.
 */
export function BalanceChip({ amountCents, currency, className }: BalanceChipProps) {
  const direction = amountCents > 0 ? 'owed' : amountCents < 0 ? 'owes' : 'settled';
  const text =
    direction === 'settled'
      ? 'Settled up'
      : `${direction === 'owed' ? 'Owed' : 'Owes'} ${currency} ${formatAbsCents(amountCents)}`;

  return (
    <span className={[styles.chip, styles[direction], className].filter(Boolean).join(' ')}>
      {text}
    </span>
  );
}
