// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CurrencyInput } from '../CurrencyInput';

afterEach(cleanup);

describe('CurrencyInput', () => {
  it('renders the value formatted as decimal text', () => {
    render(<CurrencyInput valueCents={1250} onValueChange={() => {}} aria-label="Amount" />);
    expect((screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement).value).toBe(
      '12.50',
    );
  });

  it('renders empty text for a null value', () => {
    render(<CurrencyInput valueCents={null} onValueChange={() => {}} aria-label="Amount" />);
    expect((screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement).value).toBe('');
  });

  it('reports the typed amount as integer cents', () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput valueCents={null} onValueChange={onValueChange} aria-label="Amount" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: '9.99' },
    });
    expect(onValueChange).toHaveBeenCalledWith(999);
  });

  it('reports null for an unparsable value', () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput valueCents={null} onValueChange={onValueChange} aria-label="Amount" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: 'abc' },
    });
    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it('sets inputMode to decimal', () => {
    render(<CurrencyInput valueCents={null} onValueChange={() => {}} aria-label="Amount" />);
    expect(screen.getByRole('textbox', { name: 'Amount' }).getAttribute('inputmode')).toBe(
      'decimal',
    );
  });
});
