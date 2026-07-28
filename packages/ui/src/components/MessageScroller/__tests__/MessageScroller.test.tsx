// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MessageScroller } from '../MessageScroller';

afterEach(cleanup);

/** jsdom doesn't implement layout, so scrollHeight/clientHeight are always 0
 * unless stubbed. Mirrors the common pattern for testing scroll behavior. */
function stubScrollMetrics(
  el: HTMLElement,
  {
    scrollHeight,
    clientHeight,
    scrollTop,
  }: {
    scrollHeight: number;
    clientHeight: number;
    scrollTop: number;
  },
) {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true, configurable: true });
}

describe('MessageScroller', () => {
  it('auto-scrolls to the bottom when near-bottom and children change', () => {
    const { container, rerender } = render(
      <MessageScroller>
        <div>message 1</div>
      </MessageScroller>,
    );
    const scrollEl = container.querySelector('[class*="scrollContainer"]') as HTMLElement;
    stubScrollMetrics(scrollEl, { scrollHeight: 500, clientHeight: 200, scrollTop: 0 });

    rerender(
      <MessageScroller>
        <div>message 1</div>
        <div>message 2</div>
      </MessageScroller>,
    );

    expect(scrollEl.scrollTop).toBe(500);
    expect(screen.queryByText('New messages ↓')).toBeNull();
  });

  it('shows a "New messages" button instead of auto-scrolling when scrolled up', () => {
    const { container, rerender } = render(
      <MessageScroller>
        <div>message 1</div>
      </MessageScroller>,
    );
    const scrollEl = container.querySelector('[class*="scrollContainer"]') as HTMLElement;
    // Simulate the user having scrolled up, far from the bottom.
    stubScrollMetrics(scrollEl, { scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    fireEvent.scroll(scrollEl);

    rerender(
      <MessageScroller>
        <div>message 1</div>
        <div>message 2</div>
      </MessageScroller>,
    );

    expect(screen.getByText('New messages ↓')).toBeDefined();
  });

  it('scrolling back near the bottom does not force scrollTop (no fighting the user)', () => {
    const { container } = render(
      <MessageScroller>
        <div>message 1</div>
      </MessageScroller>,
    );
    const scrollEl = container.querySelector('[class*="scrollContainer"]') as HTMLElement;
    stubScrollMetrics(scrollEl, { scrollHeight: 500, clientHeight: 200, scrollTop: 450 });
    fireEvent.scroll(scrollEl);

    expect(scrollEl.scrollTop).toBe(450);
  });

  it('clicking the jump button scrolls to bottom and hides the button', () => {
    const { container, rerender } = render(
      <MessageScroller>
        <div>message 1</div>
      </MessageScroller>,
    );
    const scrollEl = container.querySelector('[class*="scrollContainer"]') as HTMLElement;
    stubScrollMetrics(scrollEl, { scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    fireEvent.scroll(scrollEl);
    rerender(
      <MessageScroller>
        <div>message 1</div>
        <div>message 2</div>
      </MessageScroller>,
    );
    expect(screen.getByText('New messages ↓')).toBeDefined();

    scrollEl.scrollTo = vi.fn();
    fireEvent.click(screen.getByText('New messages ↓'));

    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: 500, behavior: 'smooth' });
    expect(screen.queryByText('New messages ↓')).toBeNull();
  });
});
