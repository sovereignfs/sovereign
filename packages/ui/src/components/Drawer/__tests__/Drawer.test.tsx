// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Drawer } from '../Drawer';

// Drawer's exit animation reads prefers-reduced-motion via matchMedia, which
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

// jsdom does not implement Element.setPointerCapture/releasePointerCapture
// (another documented gap, alongside matchMedia and HTMLDialogElement) — the
// grab handle's pointerdown handler calls setPointerCapture unconditionally.
function installPointerCapture() {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
}

describe('Drawer', () => {
  beforeEach(() => {
    installMatchMedia();
    installPointerCapture();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders nothing when closed', () => {
    render(
      <Drawer open={false} onClose={() => {}}>
        Body
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the panel with its accessible name when open', () => {
    render(
      <Drawer open onClose={() => {}} aria-label="Navigation">
        Body
      </Drawer>,
    );
    const panel = screen.getByRole('dialog', { name: 'Navigation' });
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose}>
        Body
      </Drawer>,
    );
    // Keyboard handler is registered on document (not the drawer element) so
    // screen readers and keyboard users can dismiss from anywhere in the page.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on scrim click but not on panel click', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Drawer open onClose={onClose} aria-label="Nav">
        <button>Action</button>
      </Drawer>,
    );
    // The scrim is the outermost div; the panel is a child.
    fireEvent.click(screen.getByRole('dialog')); // panel — should not close
    expect(onClose).not.toHaveBeenCalled();
    // Click the scrim background (the container's first child).
    const scrim = container.firstElementChild as HTMLElement;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies the half snapHeight class', () => {
    render(
      <Drawer open onClose={() => {}} aria-label="Nav" snapHeight="half">
        Body
      </Drawer>,
    );
    expect(screen.getByRole('dialog').className).toMatch(/panelHalf/);
  });

  it('does not apply the half snapHeight class by default (content-sized)', () => {
    render(
      <Drawer open onClose={() => {}} aria-label="Nav">
        Body
      </Drawer>,
    );
    expect(screen.getByRole('dialog').className).not.toMatch(/panelHalf/);
  });

  describe('swipe-down-to-dismiss (grab handle)', () => {
    // The handle is the panel's first child, aria-hidden and unlabeled —
    // same "select via DOM position" approach the scrim-click test above
    // already uses for a similarly unlabeled element.
    function getHandle() {
      return screen.getByRole('dialog').firstElementChild as HTMLElement;
    }

    it('dismisses when dragged past the threshold', () => {
      const onClose = vi.fn();
      render(
        <Drawer open onClose={onClose} aria-label="Nav">
          Body
        </Drawer>,
      );
      const handle = getHandle();
      fireEvent.pointerDown(handle, { clientY: 0 });
      fireEvent.pointerMove(handle, { clientY: 150 });
      fireEvent.pointerUp(handle, { clientY: 150 }); // 150px > 100px threshold
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('snaps back without dismissing when released under the threshold', () => {
      const onClose = vi.fn();
      render(
        <Drawer open onClose={onClose} aria-label="Nav">
          Body
        </Drawer>,
      );
      const handle = getHandle();
      fireEvent.pointerDown(handle, { clientY: 0 });
      fireEvent.pointerMove(handle, { clientY: 40 });
      fireEvent.pointerUp(handle, { clientY: 40 }); // 40px < 100px threshold
      expect(onClose).not.toHaveBeenCalled();
    });

    it('snaps back without dismissing on pointercancel, regardless of distance', () => {
      const onClose = vi.fn();
      render(
        <Drawer open onClose={onClose} aria-label="Nav">
          Body
        </Drawer>,
      );
      const handle = getHandle();
      fireEvent.pointerDown(handle, { clientY: 0 });
      fireEvent.pointerMove(handle, { clientY: 200 }); // well past the threshold
      fireEvent.pointerCancel(handle, { clientY: 200 });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('ignores upward drags (already fully open)', () => {
      const onClose = vi.fn();
      render(
        <Drawer open onClose={onClose} aria-label="Nav">
          Body
        </Drawer>,
      );
      const handle = getHandle();
      fireEvent.pointerDown(handle, { clientY: 100 });
      fireEvent.pointerMove(handle, { clientY: 0 }); // upward
      fireEvent.pointerUp(handle, { clientY: 0 });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
