import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { default: NotFound } = await import('../../app/not-found');
const { default: RootError } = await import('../../app/error');

describe('the pages for an address that leads nowhere, and for a page that failed', () => {
  it('says so in plain words, with one way onward that looks like a button', () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('This page is not here');
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*class="[^"]*button/);
    // The same page for a Console page someone may not open: it says nothing of what is there.
    expect(html).not.toMatch(/console|forbidden|permission/i);
  });

  it('offers to try again when a page failed, and tells nothing of why', () => {
    const html = renderToStaticMarkup(
      <RootError error={new Error('secret detail')} reset={vi.fn()} />,
    );
    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).not.toContain('secret detail');
  });
});
