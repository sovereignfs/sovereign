// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SplitMethodSelector } from '../SplitMethodSelector';

afterEach(cleanup);

describe('SplitMethodSelector', () => {
  it('offers the four ways to split, as one group', () => {
    render(<SplitMethodSelector value="equal" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Split method' })).toBeDefined();
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Equal',
      'Amount',
      'Percentage',
      'Shares',
    ]);
  });

  it('marks the chosen one', () => {
    render(<SplitMethodSelector value="percentage" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Percentage' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Equal' }).getAttribute('aria-checked')).toBe('false');
  });

  it('reports the way chosen', () => {
    const onChange = vi.fn();
    render(<SplitMethodSelector value="equal" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Shares' }));
    expect(onChange).toHaveBeenCalledWith('shares');
  });

  it('can be named otherwise', () => {
    render(<SplitMethodSelector value="equal" onChange={() => {}} aria-label="How to divide it" />);
    expect(screen.getByRole('radiogroup', { name: 'How to divide it' })).toBeDefined();
  });
});
