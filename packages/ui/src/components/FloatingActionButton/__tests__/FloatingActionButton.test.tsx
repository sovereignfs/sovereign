// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FloatingActionButton } from '../FloatingActionButton';

afterEach(cleanup);

describe('FloatingActionButton', () => {
  it('is a button named by its label, with the icon left out of the name', () => {
    render(<FloatingActionButton label="Check in" icon={<svg data-testid="icon" />} />);
    const button = screen.getByRole('button', { name: 'Check in' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent).toBe('');
    expect(screen.getByTestId('icon').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  it('calls onClick, and does not when it is disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <FloatingActionButton label="Check in" icon="+" onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<FloatingActionButton label="Check in" icon="+" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is a link when it is given an address, and keeps what an anchor takes', () => {
    render(<FloatingActionButton label="Check in" icon="+" href="/checkins/new" rel="nofollow" />);
    const link = screen.getByRole('link', { name: 'Check in' });
    expect(link.getAttribute('href')).toBe('/checkins/new');
    expect(link.getAttribute('rel')).toBe('nofollow');
  });

  it('shows the label beside the icon when it is extended, still named once', () => {
    render(<FloatingActionButton label="Check in" icon="+" extended />);
    const button = screen.getByRole('button', { name: 'Check in' });
    expect(button.textContent).toBe('+Check in');
    expect(screen.getAllByText('Check in')).toHaveLength(1);
  });

  it('takes the caller’s class', () => {
    render(<FloatingActionButton label="Check in" icon="+" className="mine" />);
    expect(screen.getByRole('button').className).toContain('mine');
  });
});
