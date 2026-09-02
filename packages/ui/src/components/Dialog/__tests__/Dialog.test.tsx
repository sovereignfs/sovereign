// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '../../ConfirmDialog/ConfirmDialog';
import { Dialog, useOverlaySecondRow } from '../Dialog';

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

  it('calls onClose exactly once on Escape with focus inside the panel', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} aria-label="Panel">
        <button>Focus me</button>
      </Dialog>,
    );
    // Dispatched from the actually-focused element (matching real usage,
    // where useOverlayFocusCapture moves focus into the panel on open) so the
    // keydown bubbles through the scrim on its way to document — the exact
    // path that used to trigger both the scrim's own (now-removed) Escape
    // handler and useOverlayKeyboardTrap's document-level listener, double-
    // firing onClose. Dispatching straight on `document` (the previous form
    // of this test) skips that bubble path and would pass even if the bug
    // were reintroduced.
    const button = screen.getByRole('button', { name: 'Focus me' });
    button.focus();
    fireEvent.keyDown(button, { key: 'Escape' });
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
      <Dialog open onClose={() => {}} size="lg" aria-label="Big">
        Body
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('lg');
  });

  it('supports the sm size', () => {
    render(
      <Dialog open onClose={() => {}} size="sm" aria-label="Small">
        Body
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('sm');
  });

  it('supports the auto size', () => {
    render(
      <Dialog open onClose={() => {}} size="auto" aria-label="Auto-sized">
        Body
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('auto');
  });

  it('supports the fixed size (epic task 14.5)', () => {
    render(
      <Dialog open onClose={() => {}} size="fixed" aria-label="Fixed-size">
        Body
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('fixed');
  });

  it('renders a descendant-supplied secondRow via useOverlaySecondRow', () => {
    function TabStrip() {
      useOverlaySecondRow(<nav>Tab strip</nav>);
      return null;
    }
    render(
      <Dialog open onClose={() => {}} title="Account" aria-label="Account">
        <TabStrip />
      </Dialog>,
    );
    expect(screen.getByText('Tab strip')).toBeTruthy();
  });

  it('removes the secondRow when the supplying descendant unmounts', () => {
    function TabStrip() {
      useOverlaySecondRow(<nav>Tab strip</nav>);
      return null;
    }
    function Harness({ showTabs }: { showTabs: boolean }) {
      return (
        <Dialog open onClose={() => {}} title="Account" aria-label="Account">
          {showTabs && <TabStrip />}
        </Dialog>
      );
    }
    const { rerender } = render(<Harness showTabs />);
    expect(screen.getByText('Tab strip')).toBeTruthy();
    rerender(<Harness showTabs={false} />);
    expect(screen.queryByText('Tab strip')).toBeNull();
  });

  it('is a no-op when called outside a Dialog', () => {
    function Standalone() {
      useOverlaySecondRow(<nav>Tab strip</nav>);
      return <span>Standalone content</span>;
    }
    render(<Standalone />);
    expect(screen.getByText('Standalone content')).toBeTruthy();
    expect(screen.queryByText('Tab strip')).toBeNull();
  });

  describe('Body only (default — no header/footer props)', () => {
    it('renders exactly one close button and no footer', () => {
      render(
        <Dialog open onClose={() => {}} title="Settings" aria-label="Settings">
          Body
        </Dialog>,
      );
      // Both the mobile-only OverlayHeader's close button and the
      // desktop-only floating one are always in the DOM (CSS toggles which
      // is visible per breakpoint, not React) — unchanged from before this
      // task, since this is the `header`-omitted branch.
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
      expect(screen.getByText('Settings')).toBeTruthy();
    });
  });

  describe('Header + Body (header prop)', () => {
    it('renders header content via a single OverlayHeader, on both breakpoints, instead of the mobile-only title bar', () => {
      render(
        <Dialog open onClose={() => {}} header={<span>Card detail</span>} aria-label="Card detail">
          Body
        </Dialog>,
      );
      expect(screen.getByText('Card detail')).toBeTruthy();
      // Only one close button now — the header branch skips the separate
      // desktop .close button entirely (see Dialog.tsx's own comment).
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
    });

    it('supersedes title for visible content but keeps title as the aria-label fallback', () => {
      render(
        <Dialog open onClose={() => {}} title="Fallback name" header={<span>Visible header</span>}>
          Body
        </Dialog>,
      );
      expect(screen.getByText('Visible header')).toBeTruthy();
      expect(screen.queryByText('Fallback name')).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Fallback name' })).toBeTruthy();
    });
  });

  describe('Header + Body + Footer (header and footer props)', () => {
    it('renders footer content as a non-scrolling sibling of the body', () => {
      render(
        <Dialog
          open
          onClose={() => {}}
          header={<span>Card detail</span>}
          footer={<button type="button">Save</button>}
          aria-label="Card detail"
        >
          <p>Body content</p>
        </Dialog>,
      );
      const footerButton = screen.getByRole('button', { name: 'Save' });
      const bodyText = screen.getByText('Body content');
      expect(footerButton).toBeTruthy();
      // Footer is a sibling of .content (the scroll region), not nested
      // inside it — it must never scroll away with the body.
      expect(bodyText.closest('[class*="content"]')?.contains(footerButton)).toBe(false);
    });

    it('omits the footer row entirely when footer is not provided', () => {
      render(
        <Dialog open onClose={() => {}} header={<span>Card detail</span>} aria-label="Card detail">
          Body
        </Dialog>,
      );
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });
  });
});

describe('Dialog Escape precedence with a nested ConfirmDialog', () => {
  beforeEach(() => {
    installMatchMedia();
    // jsdom does not implement HTMLDialogElement — see ConfirmDialog.test.tsx
    // for the full rationale on the guard + deferred dispatch (both matter
    // here too: without the guard, this file's own reuse of the mock across
    // renders would double-dispatch; without deferring, ConfirmDialog's
    // unregister-on-close wouldn't have run yet by the time this test reads
    // the outer Dialog's response to a second Escape).
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      queueMicrotask(() => this.dispatchEvent(new Event('close')));
    };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('defers Escape to a nested open ConfirmDialog instead of closing the outer Dialog', async () => {
    const outerOnClose = vi.fn();

    function NestedHarness() {
      // Starts closed and opens via a later click — matching the real
      // sequence (CardDetailOverlay: the outer Dialog is already mounted and
      // registered before the user ever triggers the nested confirm).
      // Mounting both already-open in the same initial render would instead
      // have React fire the child's (ConfirmDialog's) registration effect
      // before the parent's (Dialog's) in that one shared commit — the one
      // case this stack-order approach doesn't handle, and not the shape of
      // the bug this task fixes.
      const [confirmOpen, setConfirmOpen] = useState(false);
      return (
        <Dialog open onClose={outerOnClose} aria-label="Card detail">
          <button onClick={() => setConfirmOpen(true)}>Delete card…</button>
          <ConfirmDialog
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => {}}
            title="Delete card?"
            message="This can't be undone."
          />
        </Dialog>
      );
    }

    render(<NestedHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete card…' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();

    // The nested ConfirmDialog is topmost — the outer Dialog's document-level
    // Escape listener must not act while it's open.
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(outerOnClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();

    // Dismiss the nested confirm (unregisters it from the open-overlay
    // stack) — the outer Dialog is now topmost again.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    // A second Escape now reaches the outer Dialog.
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(outerOnClose).toHaveBeenCalledOnce();
  });
});
