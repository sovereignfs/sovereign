// @vitest-environment jsdom
import { StrictMode } from 'react';
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
});
