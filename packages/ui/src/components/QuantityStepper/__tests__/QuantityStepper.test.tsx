// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuantityStepper } from '../QuantityStepper';

afterEach(cleanup);

describe('QuantityStepper', () => {
  it('renders the current value in the number field', () => {
    render(<QuantityStepper value={3} onChange={() => {}} aria-label="Quantity" />);
    expect((screen.getByRole('spinbutton', { name: 'Quantity' }) as HTMLInputElement).value).toBe(
      '3',
    );
  });

  it('increments the value on the + button', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={3} onChange={onChange} aria-label="Quantity" />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase Quantity' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('decrements the value on the - button', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={3} onChange={onChange} aria-label="Quantity" />);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Quantity' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('disables the decrement button at min', () => {
    render(<QuantityStepper value={0} onChange={() => {}} min={0} aria-label="Quantity" />);
    expect(
      (screen.getByRole('button', { name: 'Decrease Quantity' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('disables the increment button at max', () => {
    render(<QuantityStepper value={5} onChange={() => {}} max={5} aria-label="Quantity" />);
    expect(
      (screen.getByRole('button', { name: 'Increase Quantity' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('respects a fractional step', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={1} onChange={onChange} step={0.5} aria-label="Quantity" />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase Quantity' }));
    expect(onChange).toHaveBeenCalledWith(1.5);
  });

  it('renders the unit suffix when provided', () => {
    render(<QuantityStepper value={2} onChange={() => {}} unit="kg" aria-label="Quantity" />);
    expect(screen.getByText('kg')).toBeDefined();
  });

  it('disables all controls when disabled', () => {
    render(<QuantityStepper value={2} onChange={() => {}} disabled aria-label="Quantity" />);
    expect(
      (screen.getByRole('button', { name: 'Increase Quantity' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Decrease Quantity' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('spinbutton', { name: 'Quantity' }) as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('calls onChange with the clamped typed value', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={2} onChange={onChange} min={0} max={5} aria-label="Quantity" />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantity' }), {
      target: { value: '10' },
    });
    expect(onChange).toHaveBeenCalledWith(5);
  });
});
