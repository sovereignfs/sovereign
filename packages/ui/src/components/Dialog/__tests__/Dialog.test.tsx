// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '../Dialog';

describe('Dialog', () => {
  afterEach(cleanup);

  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} onClose={() => {}}>
        Body
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the panel with its accessible name when open', () => {
    render(
      <Dialog open onClose={() => {}} aria-label="Settings">
        Body
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose}>
        Body
      </Dialog>,
    );
    // Keyboard handler is registered on document (not the dialog element) so
    // screen readers and keyboard users can dismiss from anywhere in the page.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on scrim click but not on panel click', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} aria-label="Panel">
        Body
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('dialog')); // panel — should not close
    expect(onClose).not.toHaveBeenCalled();
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    expect(closeButtons.length).toBeGreaterThan(0);
    fireEvent.click(closeButtons[0] as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies the size class', () => {
    render(
      <Dialog open onClose={() => {}} size="full" aria-label="Big">
        Body
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('full');
  });

  it('supports the sm size', () => {
    render(
      <Dialog open onClose={() => {}} size="sm" aria-label="Small">
        Body
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('sm');
  });
});
