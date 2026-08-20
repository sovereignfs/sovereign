// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Markdown } from '../Markdown';

afterEach(cleanup);

describe('Markdown', () => {
  it('joins consecutive lines into one paragraph by default (soft-wrap)', () => {
    const { container } = render(<Markdown content={'Line one.\nLine two.'} />);
    const p = container.querySelector('p');
    expect(p?.textContent).toBe('Line one. Line two.');
    expect(p?.querySelector('br')).toBeNull();
  });

  it('preserveLineBreaks keeps each line on its own line via <br>', () => {
    const { container } = render(
      <Markdown content={'Line one.\nLine two.\nLine three.'} preserveLineBreaks />,
    );
    const p = container.querySelector('p');
    expect(p?.querySelectorAll('br')).toHaveLength(2);
    expect(p?.textContent).toBe('Line one.Line two.Line three.');
  });

  it('preserveLineBreaks still starts a new paragraph on a blank line', () => {
    const { container } = render(
      <Markdown content={'First paragraph.\n\nSecond paragraph.'} preserveLineBreaks />,
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe('First paragraph.');
    expect(paragraphs[1]?.textContent).toBe('Second paragraph.');
  });

  it('preserveLineBreaks does not affect headings, quotes, or lists', () => {
    const { container } = render(
      <Markdown content={'# Heading\n\n- item one\n- item two'} preserveLineBreaks />,
    );
    expect(container.querySelector('h1')?.textContent).toBe('Heading');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
});
