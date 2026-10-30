// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BalanceChip } from '../BalanceChip';

afterEach(cleanup);

describe('BalanceChip', () => {
  it('says what is owed to the person, in the currency, to the cent', () => {
    render(<BalanceChip amountCents={1250} currency="EUR" />);
    const chip = screen.getByText('Owed EUR 12.50');
    expect(chip.className).toContain('owed');
  });

  it('says what the person owes, without a minus sign', () => {
    render(<BalanceChip amountCents={-305} currency="USD" />);
    const chip = screen.getByText('Owes USD 3.05');
    expect(chip.className).toContain('owes');
  });

  it('says settled up for nothing', () => {
    render(<BalanceChip amountCents={0} currency="USD" />);
    expect(screen.getByText('Settled up').className).toContain('settled');
  });

  it('takes the caller’s class', () => {
    render(<BalanceChip amountCents={0} currency="USD" className="mine" />);
    expect(screen.getByText('Settled up').className).toContain('mine');
  });
});
