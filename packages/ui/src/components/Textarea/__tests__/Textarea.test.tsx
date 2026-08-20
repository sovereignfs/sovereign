// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Textarea } from '../Textarea';

afterEach(cleanup);

describe('Textarea', () => {
  it('renders and forwards native props', () => {
    render(<Textarea placeholder="Bio" defaultValue="Hello" />);
    const textarea = screen.getByPlaceholderText('Bio') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Hello');
  });

  it('defaults to 4 rows', () => {
    render(<Textarea aria-label="field" />);
    expect((screen.getByLabelText('field') as HTMLTextAreaElement).rows).toBe(4);
  });

  it('honours an explicit rows value', () => {
    render(<Textarea aria-label="field" rows={8} />);
    expect((screen.getByLabelText('field') as HTMLTextAreaElement).rows).toBe(8);
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Textarea aria-label="field" disabled />);
    expect((screen.getByLabelText('field') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('does not apply the auto-grow class by default', () => {
    render(<Textarea aria-label="field" />);
    expect(screen.getByLabelText('field').className).not.toMatch(/textareaAutoGrow/);
  });

  it('applies the auto-grow class and sizes height to scrollHeight when autoGrow is set', () => {
    // jsdom has no real layout engine — scrollHeight is always 0, so it must
    // be stubbed on the prototype before mount (same pattern as
    // MessageScroller's own tests) for useLayoutEffect's synchronous
    // on-mount measurement to read anything meaningful. This only proves the
    // effect reads scrollHeight and writes it back as `style.height`, not
    // that real pixel math is correct.
    const scrollHeightSpy = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(88);
    render(<Textarea aria-label="field" autoGrow defaultValue="hello" />);
    const el = screen.getByLabelText('field') as HTMLTextAreaElement;
    expect(el.className).toMatch(/textareaAutoGrow/);
    expect(el.style.height).toBe('88px');
    scrollHeightSpy.mockRestore();
  });
});
