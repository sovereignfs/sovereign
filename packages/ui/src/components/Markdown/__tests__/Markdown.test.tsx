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

describe('Markdown — ordered lists and fenced code', () => {
  it('renders an ordered list, numbering from the browser', () => {
    const { container } = render(<Markdown content={'1. first\n2. second\n3. third'} />);

    const list = container.querySelector('ol');
    expect(list).not.toBeNull();
    expect([...(list?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(list?.getAttribute('start')).toBeNull();
  });

  it('honours a list that starts at a number other than 1', () => {
    const { container } = render(<Markdown content={'4. fourth\n5. fifth'} />);
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('4');
  });

  it('accepts the 1) marker style and applies inline formatting inside items', () => {
    const { container } = render(<Markdown content={'1) do **this**'} />);

    expect(container.querySelector('ol')).not.toBeNull();
    expect(container.querySelector('ol strong')?.textContent).toBe('this');
  });

  it('keeps ordered and unordered lists as separate blocks', () => {
    const { container } = render(<Markdown content={'- bullet\n1. number'} />);

    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('ol')).toHaveLength(1);
  });

  it('renders a fenced code block verbatim, without parsing its contents', () => {
    const content = ['```ts', 'const a = 1; // **not bold**', '', '# not a heading', '```'].join(
      '\n',
    );
    const { container } = render(<Markdown content={content} />);

    const code = container.querySelector('pre code');
    expect(code?.textContent).toBe('const a = 1; // **not bold**\n\n# not a heading');
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('h1')).toBeNull();
  });

  it('exposes the fence language for styling hooks', () => {
    const { container } = render(<Markdown content={'```python\nx = 1\n```'} />);
    expect(container.querySelector('pre code')?.getAttribute('data-language')).toBe('python');
  });

  it('terminates on an unclosed fence instead of looping', () => {
    const { container } = render(<Markdown content={'text\n\n```\nnever closed'} />);
    expect(container.querySelector('pre code')?.textContent).toBe('never closed');
  });

  it('separates a code block from the paragraph before it', () => {
    const { container } = render(<Markdown content={'Try this:\n```\nrun me\n```'} />);

    expect(container.querySelector('p')?.textContent).toBe('Try this:');
    expect(container.querySelector('pre code')?.textContent).toBe('run me');
  });
});
