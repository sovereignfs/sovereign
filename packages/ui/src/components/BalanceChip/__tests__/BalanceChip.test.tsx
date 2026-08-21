// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BalanceChip } from '../BalanceChip';

afterEach(cleanup);

describe('BalanceChip', () => {
  it('renders an owed message for a positive amount', () => {
    render(<BalanceChip amountCents={1250} currency="USD" />);
    expect(screen.getByText('Owed USD 12.50')).toBeDefined();
  });

  it('renders an owes message for a negative amount', () => {
    render(<BalanceChip amountCents={-500} currency="USD" />);
    expect(screen.getByText('Owes USD 5.00')).toBeDefined();
  });

  it('renders a settled message for zero', () => {
    render(<BalanceChip amountCents={0} currency="USD" />);
    expect(screen.getByText('Settled up')).toBeDefined();
  });

  it('applies the owed variant class for a positive amount', () => {
    render(<BalanceChip amountCents={1250} currency="USD" />);
    expect(screen.getByText('Owed USD 12.50').className).toContain('owed');
  });

  it('applies the settled variant class for zero', () => {
    render(<BalanceChip amountCents={0} currency="USD" />);
    expect(screen.getByText('Settled up').className).toContain('settled');
  });
});
