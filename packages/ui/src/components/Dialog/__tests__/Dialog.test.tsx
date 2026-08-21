// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog, useOverlaySecondRow } from '../Dialog';
import { DialogBody } from '../DialogBody';
import { DialogDescription } from '../DialogDescription';
import { DialogFooter } from '../DialogFooter';
import { DialogHeader } from '../DialogHeader';
import { DialogTitle } from '../DialogTitle';

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

  it('does not call onClose on panel click', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} aria-label="Panel">
        Body
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('dialog')); // panel — should not close
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on scrim click', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog open onClose={onClose} aria-label="Panel">
        Body
      </Dialog>,
    );
    fireEvent.click(container.querySelector('[role="presentation"]') as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the close button (shown via DialogHeader) is clicked', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Panel</DialogTitle>
        </DialogHeader>
        <DialogBody>Body</DialogBody>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
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

  it('supports the xl size', () => {
    render(
      <Dialog open onClose={() => {}} size="xl" aria-label="Extra large">
        Body
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('xl');
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

  it('shows no close button by default when there is no DialogHeader', () => {
    render(
      <Dialog open onClose={() => {}} aria-label="No header">
        Body
      </Dialog>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('shows the close button by default when a DialogHeader is present', () => {
    render(
      <Dialog open onClose={() => {}}>
        <DialogHeader>
          <DialogTitle>Has close</DialogTitle>
        </DialogHeader>
        <DialogBody>Body</DialogBody>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('hides the close button when showCloseButton is false, even with a DialogHeader', () => {
    render(
      <Dialog open onClose={() => {}} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>No close</DialogTitle>
        </DialogHeader>
        <DialogBody>Body</DialogBody>
      </Dialog>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('shows the close button when showCloseButton is explicitly true, even with no DialogHeader', () => {
    render(
      <Dialog open onClose={() => {}} aria-label="Legacy header" title="Legacy" showCloseButton>
        Body
      </Dialog>,
    );
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
  });

  it('renders exactly one close button when a DialogHeader is present (no redundant mobile bar)', () => {
    render(
      <Dialog open onClose={() => {}}>
        <DialogHeader>
          <DialogTitle>Single close</DialogTitle>
        </DialogHeader>
        <DialogBody>Body</DialogBody>
      </Dialog>,
    );
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
  });

  it('renders plain children as a single scrollable region when no DialogBody is present', () => {
    const { container } = render(
      <Dialog open onClose={() => {}} aria-label="Plain">
        <p>Plain content</p>
      </Dialog>,
    );
    expect(screen.getByText('Plain content')).toBeTruthy();
    expect(container.querySelector('p')?.parentElement?.className).toContain('content');
  });

  it('renders DialogHeader, DialogBody, and DialogFooter in their own regions when composed', () => {
    render(
      <Dialog open onClose={() => {}} aria-label="Composed">
        <DialogHeader>
          <h2>Edit list</h2>
        </DialogHeader>
        <DialogBody>
          <p>Body content</p>
        </DialogBody>
        <DialogFooter>
          <button type="button">Save</button>
        </DialogFooter>
      </Dialog>,
    );
    expect(screen.getByRole('heading', { name: 'Edit list' })).toBeTruthy();
    expect(screen.getByText('Body content')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('supports DialogBody alone with no Header or Footer', () => {
    render(
      <Dialog open onClose={() => {}} aria-label="Body only">
        <DialogBody>
          <p>Just a body</p>
        </DialogBody>
      </Dialog>,
    );
    expect(screen.getByText('Just a body')).toBeTruthy();
  });

  it('wires the panel aria-labelledby to a nested DialogTitle', () => {
    render(
      <Dialog open onClose={() => {}}>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>
        <DialogBody>Body</DialogBody>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeTruthy();
  });

  it('wires the panel aria-describedby to a nested DialogDescription', () => {
    render(
      <Dialog open onClose={() => {}} aria-label="Edit profile">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Make changes to your profile here.</DialogDescription>
        </DialogHeader>
        <DialogBody>Body</DialogBody>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
      'Make changes to your profile here.',
    );
  });

  it('falls back to the aria-label prop when no DialogTitle is present', () => {
    render(
      <Dialog open onClose={() => {}} aria-label="Fallback name">
        <DialogBody>Body</DialogBody>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Fallback name' })).toBeTruthy();
  });

  it('falls back to the title prop when no DialogTitle or aria-label is present', () => {
    render(
      <Dialog open onClose={() => {}} title="Fallback title">
        <DialogBody>Body</DialogBody>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Fallback title' })).toBeTruthy();
  });

  it('removes the aria-labelledby wiring when DialogTitle unmounts', () => {
    function Harness({ showTitle }: { showTitle: boolean }) {
      return (
        <Dialog open onClose={() => {}} aria-label="Fallback">
          {showTitle && (
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
            </DialogHeader>
          )}
          <DialogBody>Body</DialogBody>
        </Dialog>
      );
    }
    const { rerender } = render(<Harness showTitle />);
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeTruthy();
    rerender(<Harness showTitle={false} />);
    expect(screen.getByRole('dialog', { name: 'Fallback' })).toBeTruthy();
  });

  it('renders the close button with a bare "x" icon, not circle-x', () => {
    render(
      <Dialog open onClose={() => {}}>
        <DialogHeader>
          <DialogTitle>Icon check</DialogTitle>
        </DialogHeader>
        <DialogBody>Body</DialogBody>
      </Dialog>,
    );
    const closeButton = screen.getByRole('button', { name: 'Close' });
    // `x` is two plain diagonal paths, no <circle> — unlike `circle-x`, which
    // this button used to render before switching to match the reference
    // design's bare "×" glyph.
    expect(closeButton.querySelector('circle')).toBeNull();
    expect(closeButton.querySelector('path')).toBeTruthy();
  });

  it('supports the auto size', () => {
    render(
      <Dialog open onClose={() => {}} size="auto" aria-label="Auto sized">
        Body
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('auto');
  });
});
