// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
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
});
