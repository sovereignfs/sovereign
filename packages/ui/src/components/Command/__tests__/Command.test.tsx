// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Command, type CommandItem } from '../Command';

// Command renders inside Dialog, whose exit animation reads
// prefers-reduced-motion via matchMedia, which jsdom does not implement —
// see Dialog.test.tsx's identical setup.
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(installMatchMedia);
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const items: CommandItem[] = [
  { id: 'new', label: 'New conversation', onSelect: vi.fn(), group: 'Actions' },
  {
    id: 'export',
    label: 'Export chat',
    onSelect: vi.fn(),
    group: 'Actions',
    keywords: 'download save',
  },
  { id: 'profile', label: 'Go to profile', onSelect: vi.fn(), group: 'Navigation' },
];

describe('Command', () => {
  it('renders nothing when closed', () => {
    render(<Command open={false} onClose={vi.fn()} items={items} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('lists all items when the query is empty', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters by label', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'profile' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Go to profile' })).toBeDefined();
  });

  it('filters by keywords in addition to the label', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'download' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Export chat' })).toBeDefined();
  });

  it('shows an empty state when nothing matches', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No matching commands.')).toBeDefined();
  });

  it('renders group headers', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    expect(screen.getByText('Actions')).toBeDefined();
    expect(screen.getByText('Navigation')).toBeDefined();
  });

  it('highlights the first item by default', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    expect(
      screen.getByRole('option', { name: 'New conversation' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('ArrowDown/ArrowUp move the highlighted item', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Export chat' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(
      screen.getByRole('option', { name: 'New conversation' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('ArrowDown does not move past the last item', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(
      screen.getByRole('option', { name: 'Go to profile' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('resets the highlighted index when the query changes', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.change(input, { target: { value: 'e' } });
    const [firstMatch] = screen.getAllByRole('option');
    expect(firstMatch?.getAttribute('aria-selected')).toBe('true');
  });

  it('Enter selects the highlighted item and closes', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const localItems: CommandItem[] = [{ id: 'a', label: 'Alpha', onSelect }];
    render(<Command open onClose={onClose} items={localItems} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking an item selects it and closes', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const localItems: CommandItem[] = [{ id: 'a', label: 'Alpha', onSelect }];
    render(<Command open onClose={onClose} items={localItems} />);
    fireEvent.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(onSelect).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sets aria-activedescendant to the highlighted option', () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    const input = screen.getByRole('combobox');
    const firstOption = screen.getByRole('option', { name: 'New conversation' });
    expect(input.getAttribute('aria-activedescendant')).toBe(firstOption.id);
  });

  it('resets the query each time it opens', () => {
    const { rerender } = render(<Command open onClose={vi.fn()} items={items} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'profile' } });
    rerender(<Command open={false} onClose={vi.fn()} items={items} />);
    rerender(<Command open onClose={vi.fn()} items={items} />);
    expect(screen.getByRole('combobox').getAttribute('value')).toBe('');
  });

  it('focuses the input on open', async () => {
    render(<Command open onClose={vi.fn()} items={items} />);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });
});
