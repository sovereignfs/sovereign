// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageContainer } from '../PageContainer';

afterEach(cleanup);

/** Classes are unhashed under Vitest's CSS-module transform, so compare token
 *  membership rather than substrings — `toContain('md')` would also match
 *  `padMd`, which is exactly the confusion these two prop scales invite. */
function classes(el: Element): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

describe('PageContainer', () => {
  it('renders its children', () => {
    render(<PageContainer>content</PageContainer>);
    expect(screen.getByText('content')).toBeDefined();
  });

  it('defaults to full max-width, so wrapping a page never silently clamps it', () => {
    render(<PageContainer>content</PageContainer>);
    expect(classes(screen.getByText('content'))).toContain('full');
  });

  it('defaults to md padding — the gutter the runtime shell used to apply', () => {
    render(<PageContainer>content</PageContainer>);
    expect(classes(screen.getByText('content'))).toContain('padMd');
  });

  it('applies sm, md, and lg max-width classes', () => {
    const { rerender } = render(<PageContainer maxWidth="sm">content</PageContainer>);
    expect(classes(screen.getByText('content'))).toContain('sm');
    rerender(<PageContainer maxWidth="md">content</PageContainer>);
    expect(classes(screen.getByText('content'))).toContain('md');
    rerender(<PageContainer maxWidth="lg">content</PageContainer>);
    expect(classes(screen.getByText('content'))).toContain('lg');
  });

  it('applies none, sm, and lg padding classes', () => {
    const { rerender } = render(<PageContainer padding="none">content</PageContainer>);
    expect(classes(screen.getByText('content'))).toContain('padNone');
    rerender(<PageContainer padding="sm">content</PageContainer>);
    expect(classes(screen.getByText('content'))).toContain('padSm');
    rerender(<PageContainer padding="lg">content</PageContainer>);
    expect(classes(screen.getByText('content'))).toContain('padLg');
  });

  it('composes max-width and padding independently', () => {
    render(
      <PageContainer maxWidth="sm" padding="none">
        content
      </PageContainer>,
    );
    const cls = classes(screen.getByText('content'));
    expect(cls).toContain('sm');
    expect(cls).toContain('padNone');
    expect(cls).not.toContain('padSm');
  });

  it('forwards className and other div props', () => {
    render(
      <PageContainer className="custom" data-testid="container">
        content
      </PageContainer>,
    );
    const el = screen.getByTestId('container');
    expect(classes(el)).toContain('custom');
  });
});
