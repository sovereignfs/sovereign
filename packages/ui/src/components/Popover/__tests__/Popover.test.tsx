// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Popover } from '../Popover';

afterEach(cleanup);

const trigger = <button type="button">Open</button>;

describe('Popover', () => {
  it('renders the trigger element', () => {
    render(
      <Popover open={false} onClose={() => {}} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeDefined();
  });

  it('does not render the panel when closed', () => {
    render(
      <Popover open={false} onClose={() => {}} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the panel with children when open', () => {
    render(
      <Popover open={true} onClose={() => {}} aria-label="Menu" trigger={trigger}>
        Panel content
      </Popover>,
    );
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeDefined();
    expect(screen.getByText('Panel content')).toBeDefined();
  });

  it('applies the right alignment class by default', () => {
    render(
      <Popover open={true} onClose={() => {}} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    expect(screen.getByRole('dialog').className).toContain('right');
  });

  it('applies the left alignment class when specified', () => {
    render(
      <Popover open={true} onClose={() => {}} align="left" aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    expect(screen.getByRole('dialog').className).toContain('left');
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Popover open={true} onClose={onClose} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when clicking outside the container', () => {
    const onClose = vi.fn();
    render(
      <Popover open={true} onClose={onClose} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe('Escape precedence with a nested Popover', () => {
    it('defers Escape to a nested open Popover instead of closing the outer one', () => {
      const outerOnClose = vi.fn();

      function NestedHarness() {
        // Starts closed and opens via a later click, matching the real
        // sequence (e.g. a date-picker Popover opened from a field inside a
        // Combobox's own popover content) — mounting both already-open in
        // the same initial render would instead have React fire the child's
        // registration effect before the parent's in that one shared commit,
        // the one case this stack-order approach doesn't handle (see the
        // equivalent Dialog+ConfirmDialog regression test's own note).
        const [innerOpen, setInnerOpen] = useState(false);
        return (
          <Popover open={true} onClose={outerOnClose} aria-label="Outer" trigger={trigger}>
            <button type="button" onClick={() => setInnerOpen(true)}>
              Open inner
            </button>
            <Popover
              open={innerOpen}
              onClose={() => setInnerOpen(false)}
              aria-label="Inner"
              trigger={<span />}
            >
              Inner content
            </Popover>
          </Popover>
        );
      }

      render(<NestedHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Open inner' }));
      expect(screen.getByRole('dialog', { name: 'Inner' })).toBeTruthy();

      // The nested Popover is topmost — the outer Popover's own Escape
      // listener must not act while it's open.
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(outerOnClose).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull();

      // With the inner one dismissed, the outer Popover is topmost again —
      // a second Escape now reaches it.
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(outerOnClose).toHaveBeenCalledOnce();
    });
  });

  it('does not call onClose when clicking inside the panel', () => {
    const onClose = vi.fn();
    render(
      <Popover open={true} onClose={onClose} aria-label="Menu" trigger={trigger}>
        <button type="button">Inside</button>
      </Popover>,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies the provided width as inline style', () => {
    render(
      <Popover open={true} onClose={() => {}} aria-label="Menu" width={320} trigger={trigger}>
        Content
      </Popover>,
    );
    expect((screen.getByRole('dialog') as HTMLElement).style.width).toBe('320px');
  });

  describe('horizontal viewport clamp', () => {
    const rect = (partial: Partial<DOMRect>): DOMRect =>
      ({
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON() {},
        ...partial,
      }) as DOMRect;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shifts the panel back on-screen when align="right" would overflow the left edge', () => {
      // A 340px-wide panel right-aligned under a trigger sitting near the
      // right edge of a 375px viewport (e.g. a mobile header bell) — its
      // natural `right: 0` position runs off the left edge, mirroring the
      // real KanbanNotificationBell overflow found live-testing at 375px.
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      const containerRect = rect({ left: 275, right: 319, top: 12, bottom: 56 });
      const panelRect = rect({
        left: -21,
        right: 319,
        top: 64,
        bottom: 200,
        width: 340,
        height: 136,
      });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        return this.getAttribute('role') === 'dialog' ? panelRect : containerRect;
      });

      render(
        <Popover open={true} onClose={() => {}} aria-label="Menu" width={340} trigger={trigger}>
          Content
        </Popover>,
      );

      const panel = screen.getByRole('dialog') as HTMLElement;
      // containerRect.left (275) + style.left must land the panel's left
      // edge at the 4px viewport margin: 4 - 275 = -271.
      expect(panel.style.left).toBe('-271px');
      expect(panel.style.right).toBe('auto');
    });

    it('leaves alignment untouched when the panel already fits the viewport', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      const containerRect = rect({ left: 900, right: 944, top: 12, bottom: 56 });
      const panelRect = rect({
        left: 604,
        right: 944,
        top: 64,
        bottom: 200,
        width: 340,
        height: 136,
      });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        return this.getAttribute('role') === 'dialog' ? panelRect : containerRect;
      });

      render(
        <Popover open={true} onClose={() => {}} aria-label="Menu" width={340} trigger={trigger}>
          Content
        </Popover>,
      );

      const panel = screen.getByRole('dialog') as HTMLElement;
      expect(panel.style.left).toBe('');
      expect(panel.style.right).toBe('');
    });

    it('stays clamped under StrictMode double-invoked layout effects', () => {
      // Regression test: an earlier version of this clamp measured the
      // panel's *current* `left`/`right` off the DOM to decide whether a
      // correction was needed. That's not idempotent — StrictMode's dev-only
      // double-invoke of layout effects re-ran the same measurement against
      // the panel's own just-applied correction, saw a rect that already
      // looked fine, and reset `horizontalOffset` back to null before first
      // paint (found live: the panel visibly overflowed again after HMR).
      // The fix derives the natural position analytically from `containerRect`
      // instead, which StrictMode's replay can't perturb.
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      const containerRect = rect({ left: 275, right: 319, top: 12, bottom: 56 });
      const panelWidthOnly = rect({ width: 340, height: 136, top: 64, bottom: 200 });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        return this.getAttribute('role') === 'dialog' ? panelWidthOnly : containerRect;
      });

      render(
        <StrictMode>
          <Popover open={true} onClose={() => {}} aria-label="Menu" width={340} trigger={trigger}>
            Content
          </Popover>
        </StrictMode>,
      );

      const panel = screen.getByRole('dialog') as HTMLElement;
      expect(panel.style.left).toBe('-271px');
      expect(panel.style.right).toBe('auto');
    });
  });

  describe('align="auto"', () => {
    const rect = (partial: Partial<DOMRect>): DOMRect =>
      ({
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON() {},
        ...partial,
      }) as DOMRect;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** A 44px trigger and a panel of `width`, in a viewport of `viewport`, with a scrolling ancestor from `scroller` when given. */
    function open({
      align = 'auto' as 'left' | 'right' | 'auto',
      viewport = 1280,
      at: [left, right] = [900, 944],
      width = 240,
      scroller,
      strict = false,
    }: {
      align?: 'left' | 'right' | 'auto';
      viewport?: number;
      at?: [number, number];
      width?: number;
      scroller?: [number, number];
      strict?: boolean;
    }) {
      Object.defineProperty(window, 'innerWidth', { value: viewport, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      const containerRect = rect({ left, right, top: 12, bottom: 56, width: right - left });
      const panelRect = rect({ width, height: 136, top: 64, bottom: 200 });
      const scrollerRect = scroller
        ? rect({ left: scroller[0], right: scroller[1], top: 0, bottom: 800 })
        : containerRect;
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        if (this.getAttribute('role') === 'dialog') return panelRect;
        return this.hasAttribute('data-scroller') ? scrollerRect : containerRect;
      });
      const popover = (
        <Popover
          open={true}
          onClose={() => {}}
          align={align}
          aria-label="Menu"
          width={width}
          trigger={trigger}
        >
          Content
        </Popover>
      );
      const inScroller = scroller ? (
        <div data-scroller style={{ overflowX: 'auto' }}>
          {popover}
        </div>
      ) : (
        popover
      );
      render(strict ? <StrictMode>{inScroller}</StrictMode> : inScroller);
      return screen.getByRole('dialog') as HTMLElement;
    }

    it('is right-aligned where the panel fits on that side', () => {
      const panel = open({});
      expect(panel.className).toContain('right');
      expect(panel.className).not.toContain('left');
      expect(panel.style.left).toBe('');
    });

    it('is left-aligned where the viewport has no room to the left of the trigger', () => {
      const panel = open({ at: [20, 64] });
      expect(panel.className).toContain('left');
      expect(panel.className).not.toContain('right');
      expect(panel.style.left).toBe('');
    });

    it('counts a scrolling ancestor as the edge: a trigger beside a sidebar opens rightwards', () => {
      // The viewport has 504px to the left of the trigger's right edge, but the page's scroller starts at 387, where the panel
      // would be cut off (240px right-aligned under a trigger ending at 504 begins at 264).
      const panel = open({ at: [460, 504], scroller: [387, 1280] });
      expect(panel.className).toContain('left');
      expect(panel.className).not.toContain('right');
    });

    it('stays right-aligned for the same trigger when nothing clips the left', () => {
      const panel = open({ at: [460, 504] });
      expect(panel.className).toContain('right');
    });

    it('is right-aligned where a scrolling ancestor leaves room', () => {
      const panel = open({ at: [760, 804], scroller: [387, 1280] });
      expect(panel.className).toContain('right');
    });

    it('does not move an explicit align for a clipping ancestor', () => {
      const panel = open({ align: 'right', at: [460, 504], scroller: [387, 1280] });
      expect(panel.className).toContain('right');
      expect(panel.className).not.toContain('left');
    });

    it('takes the side with more room when neither fits, and keeps the panel on-screen', () => {
      // 340px in a 375px viewport, under a trigger at 150 to 194: 194px to its left, 225px to its right.
      const panel = open({ viewport: 375, at: [150, 194], width: 340 });
      expect(panel.className).toContain('left');
      // The clamp puts the panel's left edge at 375 - 4 - 340 = 31, which is -119px from the trigger's.
      expect(panel.style.left).toBe('-119px');
    });

    it('chooses the same side under StrictMode double-invoked layout effects', () => {
      const panel = open({ at: [460, 504], scroller: [387, 1280], strict: true });
      expect(panel.className).toContain('left');
      expect(panel.className).not.toContain('right');
    });

    it('keeps the default side for a panel that has no width yet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
      render(
        <Popover open={true} onClose={() => {}} align="auto" aria-label="Menu" trigger={trigger}>
          Content
        </Popover>,
      );
      expect(screen.getByRole('dialog').className).toContain('right');
    });
  });
});
