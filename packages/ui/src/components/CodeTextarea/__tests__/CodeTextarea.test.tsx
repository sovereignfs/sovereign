// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CodeTextarea } from '../CodeTextarea';

afterEach(cleanup);

describe('CodeTextarea', () => {
  it('is a textarea set up for code: twelve rows, no spell check, no wrapping', () => {
    render(<CodeTextarea aria-label="Query" />);
    const field = screen.getByRole('textbox', { name: 'Query' }) as HTMLTextAreaElement;
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.rows).toBe(12);
    expect(field.getAttribute('spellcheck')).toBe('false');
    expect(field.getAttribute('wrap')).toBe('off');
  });

  it('lets the caller change each of those', () => {
    render(<CodeTextarea aria-label="Query" rows={3} spellCheck wrap="soft" />);
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(field.rows).toBe(3);
    expect(field.getAttribute('spellcheck')).toBe('true');
    expect(field.getAttribute('wrap')).toBe('soft');
  });

  it('says it is invalid to assistive technology, and styles itself so', () => {
    render(<CodeTextarea aria-label="Query" invalid />);
    const field = screen.getByRole('textbox');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.className).toContain('invalid');
  });

  it('is not invalid by default, and an aria-invalid the caller gives wins', () => {
    render(<CodeTextarea aria-label="Query" />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBeNull();
    cleanup();
    render(<CodeTextarea aria-label="Query" invalid aria-invalid="false" />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('false');
  });

  it('passes the value, the handlers and the caller’s class on', () => {
    render(<CodeTextarea aria-label="Query" defaultValue="select 1" className="mine" />);
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(field.value).toBe('select 1');
    expect(field.className).toContain('mine');
  });
});
