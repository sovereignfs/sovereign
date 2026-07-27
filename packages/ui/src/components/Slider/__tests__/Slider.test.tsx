// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Slider } from '../Slider';

afterEach(cleanup);

describe('Slider', () => {
  it('renders a range input with the given min/max/value', () => {
    render(<Slider value={50} onChange={() => {}} min={0} max={100} aria-label="Volume" />);
    const input = screen.getByRole('slider') as HTMLInputElement;
    expect(input.min).toBe('0');
    expect(input.max).toBe('100');
    expect(input.value).toBe('50');
  });

  it('calls onChange with a number when the value changes', () => {
    const onChange = vi.fn();
    render(<Slider value={50} onChange={onChange} min={0} max={100} aria-label="Volume" />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('respects a step prop', () => {
    render(<Slider value={5} onChange={() => {}} min={0} max={10} step={5} aria-label="Volume" />);
    expect((screen.getByRole('slider') as HTMLInputElement).step).toBe('5');
  });

  it('renders a visible label and associates it via htmlFor', () => {
    render(<Slider value={50} onChange={() => {}} min={0} max={100} label="Volume" />);
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeDefined();
  });

  it('falls back to aria-label when no visible label is given', () => {
    render(<Slider value={50} onChange={() => {}} min={0} max={100} aria-label="Volume" />);
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeDefined();
  });

  it('disables the input when disabled is set', () => {
    render(
      <Slider value={50} onChange={() => {}} min={0} max={100} aria-label="Volume" disabled />,
    );
    expect(screen.getByRole('slider')).toHaveProperty('disabled', true);
  });
});
