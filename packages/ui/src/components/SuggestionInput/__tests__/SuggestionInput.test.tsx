// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SuggestionInput, type SuggestionOption } from '../SuggestionInput';

// Popover's width="trigger" mode observes the trigger's size via
// ResizeObserver, which jsdom does not implement — see Combobox's identical
// test setup.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const options: SuggestionOption[] = [
  { id: 'milk', label: 'Milk' },
  { id: 'eggs', label: 'Eggs' },
];

describe('SuggestionInput', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders a combobox input', () => {
    render(
      <SuggestionInput
        value=""
        onChange={() => {}}
        options={[]}
        onSelect={() => {}}
        aria-label="Add item"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Add item' })).toBeDefined();
  });

  it('shows suggestions once focused with matching options', () => {
    render(
      <SuggestionInput
        value="m"
        onChange={() => {}}
        options={options}
        onSelect={() => {}}
        aria-label="Add item"
      />,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'Add item' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('calls onChange as the user types', () => {
    const onChange = vi.fn();
    render(
      <SuggestionInput
        value=""
        onChange={onChange}
        options={[]}
        onSelect={() => {}}
        aria-label="Add item"
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Add item' }), {
      target: { value: 'mi' },
    });
    expect(onChange).toHaveBeenCalledWith('mi');
  });

  it('selecting an option via mousedown calls onSelect', () => {
    const onSelect = vi.fn();
    render(
      <SuggestionInput
        value="m"
        onChange={() => {}}
        options={options}
        onSelect={onSelect}
        aria-label="Add item"
      />,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'Add item' }));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Milk' }));
    expect(onSelect).toHaveBeenCalledWith(options[0]);
  });

  it('Enter selects the active option', () => {
    const onSelect = vi.fn();
    render(
      <SuggestionInput
        value="m"
        onChange={() => {}}
        options={options}
        onSelect={onSelect}
        aria-label="Add item"
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Add item' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(options[0]);
  });

  it('shows a create row when onCreate and createLabel are supplied with no matches', () => {
    const onCreate = vi.fn();
    render(
      <SuggestionInput
        value="new item"
        onChange={() => {}}
        options={[]}
        onSelect={() => {}}
        onCreate={onCreate}
        createLabel={(v) => `Add "${v}" as a new item`}
        aria-label="Add item"
      />,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'Add item' }));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Add "new item" as a new item' }));
    expect(onCreate).toHaveBeenCalledWith('new item');
  });

  it('shows a loading status instead of options', () => {
    render(
      <SuggestionInput
        value="m"
        onChange={() => {}}
        options={options}
        onSelect={() => {}}
        loading
        aria-label="Add item"
      />,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'Add item' }));
    expect(screen.getByText('Loading…')).toBeDefined();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('disables the input when disabled', () => {
    render(
      <SuggestionInput
        value=""
        onChange={() => {}}
        options={[]}
        onSelect={() => {}}
        disabled
        aria-label="Add item"
      />,
    );
    expect((screen.getByRole('combobox', { name: 'Add item' }) as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});
