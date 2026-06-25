// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { SystemBanner } from '../SystemBanner';

afterEach(cleanup);

describe('SystemBanner', () => {
  it('renders children as content', () => {
    render(<SystemBanner>Maintenance mode is active.</SystemBanner>);
    expect(screen.getByText('Maintenance mode is active.')).toBeDefined();
  });

  it('defaults to the info variant', () => {
    const { container } = render(<SystemBanner>Notice</SystemBanner>);
    expect((container.firstChild as HTMLElement).className).toContain('info');
  });

  it('applies the warning variant class', () => {
    const { container } = render(<SystemBanner variant="warning">Warning</SystemBanner>);
    expect((container.firstChild as HTMLElement).className).toContain('warning');
  });

  it('applies the error variant class', () => {
    const { container } = render(<SystemBanner variant="error">Error</SystemBanner>);
    expect((container.firstChild as HTMLElement).className).toContain('error');
  });

  it('does not render a dismiss button when onDismiss is omitted', () => {
    render(<SystemBanner>Notice</SystemBanner>);
    expect(screen.queryByRole('button', { name: 'Dismiss banner' })).toBeNull();
  });

  it('renders a dismiss button when onDismiss is provided', () => {
    render(<SystemBanner onDismiss={() => {}}>Notice</SystemBanner>);
    expect(screen.getByRole('button', { name: 'Dismiss banner' })).toBeDefined();
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<SystemBanner onDismiss={onDismiss}>Notice</SystemBanner>);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss banner' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('exposes a status live region', () => {
    render(<SystemBanner>Notice</SystemBanner>);
    expect(screen.getByRole('status')).toBeDefined();
  });
});
