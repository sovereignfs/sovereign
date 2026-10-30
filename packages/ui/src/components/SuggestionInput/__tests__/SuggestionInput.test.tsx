// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SuggestionInput, type SuggestionOption } from '../SuggestionInput';

// The list is a Popover as wide as the field, which measures it; jsdom has no ResizeObserver.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OPTIONS: SuggestionOption[] = [
  { id: 'milk', label: 'Milk', meta: 'dairy' },
  { id: 'bread', label: 'Bread' },
];

function Field(props: {
  options?: SuggestionOption[];
  onSelect?: (option: SuggestionOption) => void;
  onCreate?: (value: string) => void;
  loading?: boolean;
  initial?: string;
}) {
  const [value, setValue] = useState(props.initial ?? '');
  return (
    <SuggestionInput
      value={value}
      onChange={setValue}
      options={props.options ?? OPTIONS}
      onSelect={props.onSelect ?? (() => {})}
      aria-label="Item"
      loading={props.loading ?? false}
      {...(props.onCreate
        ? { onCreate: props.onCreate, createLabel: (v: string) => `Add “${v}”` }
        : {})}
    />
  );
}

const input = () => screen.getByRole('combobox', { name: 'Item' }) as HTMLInputElement;

describe('SuggestionInput', () => {
  it('is a closed combobox until it has focus', () => {
    render(<Field />);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens the suggestions on focus, and says it did', () => {
    render(<Field />);
    fireEvent.focus(input());
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Milkdairy',
      'Bread',
    ]);
  });

  it('moves through the suggestions with the arrow keys, round the ends, and names the active one', () => {
    render(<Field />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    const [milk, bread] = screen.getAllByRole('option');
    expect(milk?.getAttribute('aria-selected')).toBe('true');
    expect(input().getAttribute('aria-activedescendant')).toBe(milk?.id);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(bread?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(milk?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(bread?.getAttribute('aria-selected')).toBe('true');
  });

  it('chooses the active suggestion on Enter, or the first when none is active, and closes', () => {
    const onSelect = vi.fn();
    render(<Field onSelect={onSelect} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(OPTIONS[0]);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(OPTIONS[1]);
  });

  it('chooses a suggestion that is pressed on, without taking focus from the field', () => {
    const onSelect = vi.fn();
    render(<Field onSelect={onSelect} />);
    fireEvent.focus(input());
    fireEvent.mouseDown(screen.getAllByRole('option')[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(OPTIONS[1]);
  });

  it('closes on Escape without choosing', () => {
    const onSelect = vi.fn();
    render(<Field onSelect={onSelect} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers to make what was typed when it matches nothing, and makes it', () => {
    const onCreate = vi.fn();
    render(<Field options={[]} onCreate={onCreate} initial="Oat milk" />);
    fireEvent.focus(input());
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Add “Oat milk”' }));
    expect(onCreate).toHaveBeenCalledWith('Oat milk');
  });

  it('offers nothing to make for an empty field', () => {
    render(<Field options={[]} onCreate={() => {}} initial="  " />);
    fireEvent.focus(input());
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('says it is loading', () => {
    render(<Field options={[]} loading />);
    fireEvent.focus(input());
    expect(screen.getByText('Loading…')).toBeDefined();
  });
});
