// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

afterEach(cleanup);
import { Toggle } from '../Toggle';

describe('Toggle', () => {
  it('renders as a switch button', () => {
    render(<Toggle checked={false} onChange={() => {}} aria-label="Notifications" />);
    expect(screen.getByRole('switch', { name: 'Notifications' })).toBeDefined();
  });

  it('reflects checked state via aria-checked', () => {
    const { rerender } = render(
      <Toggle checked={false} onChange={() => {}} aria-label="Setting" />,
    );
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');

    rerender(<Toggle checked={true} onChange={() => {}} aria-label="Setting" />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('calls onChange with toggled value on click', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} aria-label="Setting" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} disabled aria-label="Setting" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies on class when checked', () => {
    render(<Toggle checked={true} onChange={() => {}} aria-label="Setting" />);
    expect(screen.getByRole('switch').className).toContain('on');
  });

  it('applies off class when unchecked', () => {
    render(<Toggle checked={false} onChange={() => {}} aria-label="Setting" />);
    expect(screen.getByRole('switch').className).toContain('off');
  });
});
