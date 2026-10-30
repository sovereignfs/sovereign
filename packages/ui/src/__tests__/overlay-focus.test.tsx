// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '../components/Dialog/Dialog';
import { Drawer } from '../components/Drawer/Drawer';
import { Sheet } from '../components/Sheet/Sheet';

/**
 * §6.2 of the design-system specification: a modal overlay takes focus on opening, traps it, and returns it on closing. Each is
 * opened from a button, closed with Escape, and focus must be back on that button. (`Popover` is non-modal by design and takes
 * no focus.) Reduced motion is stubbed on so that closing is
 * immediate and a test does not wait for an animation.
 */
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Opener({ overlay }: { overlay: (open: boolean, close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {overlay(open, () => setOpen(false))}
    </>
  );
}

const overlays: [string, (open: boolean, close: () => void) => React.ReactNode][] = [
  [
    'Dialog',
    (open, close) => (
      <Dialog open={open} onClose={close} aria-label="Dialog">
        <button>Inside</button>
      </Dialog>
    ),
  ],
  [
    'Drawer',
    (open, close) => (
      <Drawer open={open} onClose={close} aria-label="Drawer">
        <button>Inside</button>
      </Drawer>
    ),
  ],
  [
    'Sheet',
    (open, close) => (
      <Sheet open={open} onClose={close} aria-label="Sheet">
        <button>Inside</button>
      </Sheet>
    ),
  ],
];

describe.each(overlays)('%s', (_name, overlay) => {
  it('moves focus inside on opening, and back to what opened it on closing', async () => {
    render(<Opener overlay={overlay} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    await act(async () => {
      fireEvent.click(opener);
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      // Unmounting follows on the next tick, since the exit animation has no length.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
