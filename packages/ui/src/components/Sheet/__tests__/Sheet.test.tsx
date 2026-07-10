// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sheet } from '../Sheet';

// Sheet's exit animation reads prefers-reduced-motion via matchMedia, which
// jsdom does not implement — see Dialog.test.tsx's identical setup.
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

describe('Sheet', () => {
  beforeEach(installMatchMedia);
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={() => {}}>
        Body
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the panel with its accessible name when open', () => {
    render(
      <Sheet open onClose={() => {}} aria-label="Task detail">
        Body
      </Sheet>,
    );
    const panel = screen.getByRole('dialog', { name: 'Task detail' });
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('falls back to title for the accessible name when aria-label is omitted', () => {
    render(
      <Sheet open onClose={() => {}} title="Edit list">
        Body
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit list' })).toBeTruthy();
  });

  it('does not render OverlayHeader when title is omitted (headerless escape hatch)', () => {
    render(
      <Sheet open onClose={() => {}} aria-label="Custom">
        <button type="button">Own close button</button>
      </Sheet>,
    );
    // Only the content's own button — no OverlayHeader close button.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('renders OverlayHeader (title + close) when title is provided', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Edit list">
        Body
      </Sheet>,
    );
    expect(screen.getByText('Edit list')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} aria-label="Panel">
        Body
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies the top slide-from variant class', () => {
    render(
      <Sheet open onClose={() => {}} aria-label="Menu" slideFrom="top">
        Body
      </Sheet>,
    );
    expect(screen.getByRole('dialog').className).toMatch(/panelFromTop/);
  });
});
