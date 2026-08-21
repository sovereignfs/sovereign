// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SplitMethodSelector } from '../SplitMethodSelector';

afterEach(cleanup);

describe('SplitMethodSelector', () => {
  it('renders all four split methods', () => {
    render(<SplitMethodSelector value="equal" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Equal' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Amount' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Percentage' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Shares' })).toBeDefined();
  });

  it('marks the current value as checked', () => {
    render(<SplitMethodSelector value="percentage" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Percentage' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('calls onChange with the selected method', () => {
    const onChange = vi.fn();
    render(<SplitMethodSelector value="equal" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Shares' }));
    expect(onChange).toHaveBeenCalledWith('shares');
  });

  it('defaults the aria-label to "Split method"', () => {
    render(<SplitMethodSelector value="equal" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Split method' })).toBeDefined();
  });

  it('uses a custom aria-label when provided', () => {
    render(<SplitMethodSelector value="equal" onChange={() => {}} aria-label="Divide costs" />);
    expect(screen.getByRole('radiogroup', { name: 'Divide costs' })).toBeDefined();
  });
});
