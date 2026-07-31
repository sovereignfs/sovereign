// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SwipableMobileCarousel } from '../SwipableMobileCarousel';
import { SwipableMobileCarouselSlide } from '../SwipableMobileCarouselSlide';

beforeEach(() => {
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = vi.fn();
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWithStrayChild() {
  return render(
    <SwipableMobileCarousel activeIndex={0} onSettle={() => {}} aria-label="Test slides">
      <SwipableMobileCarouselSlide slideKey="a" label="A">
        content
      </SwipableMobileCarouselSlide>
      {/* stray non-Slide child — shifts index math for anything after it */}
      <div>oops</div>
      <SwipableMobileCarouselSlide slideKey="b" label="B">
        content
      </SwipableMobileCarouselSlide>
    </SwipableMobileCarousel>,
  );
}

describe('SwipableMobileCarousel dev-mode child-type guard', () => {
  it('warns via console.error in development, mentioning the offending child', () => {
    const originalEnv = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'development');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderWithStrayChild()).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('<div>'));
    vi.stubEnv('NODE_ENV', originalEnv ?? 'test');
  });

  it('does not call console.error in production', () => {
    const originalEnv = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderWithStrayChild()).not.toThrow();

    expect(errorSpy).not.toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', originalEnv ?? 'test');
  });

  it('never throws, even with a stray child (a miscounted slide degrades, it does not crash)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderWithStrayChild()).not.toThrow();
  });
});
