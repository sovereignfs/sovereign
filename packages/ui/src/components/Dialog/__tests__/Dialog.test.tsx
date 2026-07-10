// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '../Dialog';

// Dialog's exit animation reads prefers-reduced-motion via matchMedia, which
// jsdom does not implement. `matches: false` (motion enabled) exercises the
// normal animated path; the actual reduced-motion behaviour is covered by
// motion.ts's own tests.
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('Dialog', () => {
  beforeEach(installMatchMedia);
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

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
