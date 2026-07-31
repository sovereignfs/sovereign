// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SwipableMobileCarouselDots } from '../SwipableMobileCarouselDots';

afterEach(cleanup);

describe('SwipableMobileCarouselDots', () => {
  it('renders a tablist with one tab per count, none aria-hidden', () => {
    render(
      <SwipableMobileCarouselDots count={3} activeIndex={0} onJump={() => {}} aria-label="Lists" />,
    );
    const list = screen.getByRole('tablist', { name: 'Lists' });
    expect(list.getAttribute('aria-hidden')).toBeNull();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    tabs.forEach((tab) => expect(tab.getAttribute('aria-hidden')).toBeNull());
  });

  it('marks only the active dot as aria-selected', () => {
    render(
      <SwipableMobileCarouselDots count={3} activeIndex={1} onJump={() => {}} aria-label="Lists" />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('false');
  });

  it('uses the provided per-dot labels, falling back to "Slide N of count"', () => {
    render(
      <SwipableMobileCarouselDots
        count={3}
        activeIndex={0}
        onJump={() => {}}
        labels={['Lists', undefined, 'Groceries']}
        aria-label="Lists"
      />,
    );
    expect(screen.getByRole('tab', { name: 'Lists' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Slide 2 of 3' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Groceries' })).toBeDefined();
  });

  it('clicking a dot calls onJump with its index', () => {
    const onJump = vi.fn();
    render(
      <SwipableMobileCarouselDots count={3} activeIndex={0} onJump={onJump} aria-label="Lists" />,
    );
    const thirdTab = screen.getAllByRole('tab')[2];
    if (!thirdTab) throw new Error('expected a 3rd tab');
    fireEvent.click(thirdTab);
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it('every dot is a real, focusable button (not a decorative element)', () => {
    render(
      <SwipableMobileCarouselDots count={2} activeIndex={0} onJump={() => {}} aria-label="Lists" />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs.forEach((tab) => expect(tab.tagName).toBe('BUTTON'));
  });
});
