// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TagInput } from '../TagInput';

afterEach(cleanup);

describe('TagInput', () => {
  it('adds a tag with Enter', () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} aria-label="Tags" />);

    const input = screen.getByLabelText('Tags');
    fireEvent.change(input, { target: { value: 'launch' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['launch']);
  });

  it('removes the last tag with Backspace when the input is empty', () => {
    const onChange = vi.fn();
    render(<TagInput value={['draft', 'publish']} onChange={onChange} aria-label="Tags" />);

    fireEvent.keyDown(screen.getByLabelText('Tags'), { key: 'Backspace' });

    expect(onChange).toHaveBeenCalledWith(['draft']);
  });

  it('splits pasted comma-separated tags', () => {
    const onChange = vi.fn();
    render(<TagInput value={['draft']} onChange={onChange} aria-label="Tags" />);

    fireEvent.paste(screen.getByLabelText('Tags'), {
      clipboardData: {
        getData: () => 'launch, release\nnotes',
      },
    });

    expect(onChange).toHaveBeenCalledWith(['draft', 'launch', 'release', 'notes']);
  });

  it('shows validation messages and does not add invalid tags', () => {
    const onChange = vi.fn();
    render(
      <TagInput
        value={[]}
        onChange={onChange}
        aria-label="Tags"
        validateTag={(tag) => (tag.length > 4 ? 'Tag is too long.' : undefined)}
      />,
    );

    const input = screen.getByLabelText('Tags');
    fireEvent.change(input, { target: { value: 'launch' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('alert').textContent).toBe('Tag is too long.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders removable chips with accessible names', () => {
    const onChange = vi.fn();
    render(<TagInput value={['draft']} onChange={onChange} aria-label="Tags" />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove draft' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
