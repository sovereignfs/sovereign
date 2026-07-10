// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OverlayHeader } from '../OverlayHeader';

describe('OverlayHeader', () => {
  afterEach(cleanup);

  it('renders the title and calls onClose on the close button', () => {
    const onClose = vi.fn();
    render(<OverlayHeader title="Account" onClose={onClose} />);
    expect(screen.getByText('Account')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render a back button when onBack is omitted', () => {
    render(<OverlayHeader title="Account" onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders and wires a back button when onBack is provided', () => {
    const onBack = vi.fn();
    render(<OverlayHeader title="Account" onClose={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders the trailing action slot', () => {
    render(
      <OverlayHeader
        title="Edit list"
        onClose={() => {}}
        action={<button type="button">Save</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('renders just the close button when title is omitted', () => {
    const onClose = vi.fn();
    render(<OverlayHeader onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders the second row', () => {
    render(<OverlayHeader title="Account" onClose={() => {}} secondRow={<nav>Tab strip</nav>} />);
    expect(screen.getByText('Tab strip')).toBeTruthy();
  });
});
