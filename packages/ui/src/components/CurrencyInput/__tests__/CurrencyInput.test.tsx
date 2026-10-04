// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CurrencyInput } from '../CurrencyInput';

afterEach(cleanup);

/** Mirrors a real consumer: the integer is the state of record, the text is the field's. */
function Controlled({ decimals, initial = null }: { decimals?: number; initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <CurrencyInput
        aria-label="Amount"
        valueCents={value}
        onValueChange={setValue}
        decimals={decimals}
      />
      <output data-testid="minor">{value === null ? 'null' : String(value)}</output>
    </>
  );
}

const field = () => screen.getByLabelText('Amount') as HTMLInputElement;
const minor = () => screen.getByTestId('minor').textContent;

describe('CurrencyInput', () => {
  it('reports cents by default, so existing callers are unaffected', () => {
    render(<Controlled />);
    fireEvent.change(field(), { target: { value: '23.40' } });
    expect(minor()).toBe('2340');
  });

  it('prefills from an integer at the default exponent', () => {
    render(<Controlled initial={2340} />);
    expect(field().value).toBe('23.40');
  });

  it('reports satoshis at 8 decimals', () => {
    render(<Controlled decimals={8} />);
    fireEvent.change(field(), { target: { value: '0.00000001' } });
    expect(minor()).toBe('1');
  });

  it('rounds rather than truncates through binary floating point', () => {
    // 0.1 * 10 ** 8 is 10000000.000000002 — truncation would report 9999999.
    render(<Controlled decimals={8} />);
    fireEvent.change(field(), { target: { value: '0.1' } });
    expect(minor()).toBe('10000000');
  });

  it('supports a zero-decimal currency', () => {
    render(<Controlled decimals={0} />);
    fireEvent.change(field(), { target: { value: '1500' } });
    expect(minor()).toBe('1500');
  });

  it('prefills an 8-decimal amount without losing trailing zeros', () => {
    render(<Controlled decimals={8} initial={150_000_000} />);
    expect(field().value).toBe('1.50000000');
  });

  it('keeps the text buffer intact mid-type', () => {
    render(<Controlled />);
    // A trailing separator must survive: reformatting here would fight the cursor.
    fireEvent.change(field(), { target: { value: '12.' } });
    expect(field().value).toBe('12.');
    expect(minor()).toBe('1200');
  });

  it('reports null for an empty or unparsable field', () => {
    render(<Controlled initial={500} />);
    fireEvent.change(field(), { target: { value: '' } });
    expect(minor()).toBe('null');
    fireEvent.change(field(), { target: { value: 'abc' } });
    expect(minor()).toBe('null');
  });

  it('re-syncs the text when the exponent changes under a fixed integer', () => {
    // The same integer is a different amount once `decimals` moves, so the
    // field must not keep showing the old rendering.
    const { rerender } = render(
      <CurrencyInput aria-label="Amount" valueCents={100} onValueChange={vi.fn()} decimals={2} />,
    );
    expect(field().value).toBe('1.00');
    rerender(
      <CurrencyInput aria-label="Amount" valueCents={100} onValueChange={vi.fn()} decimals={0} />,
    );
    expect(field().value).toBe('100');
  });
});
