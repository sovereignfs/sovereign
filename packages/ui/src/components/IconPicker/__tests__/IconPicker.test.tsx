// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IconPicker } from '../IconPicker';

// Popover observes the trigger's size via ResizeObserver, which jsdom does
// not implement — see Combobox's identical test setup.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const options = ['house', 'settings', 'bell'] as const;

describe('IconPicker', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('shows a placeholder when no icon is selected', () => {
    render(
      <IconPicker value={null} onChange={() => {}} options={options} aria-label="Category icon" />,
    );
    expect(screen.getByRole('button', { name: 'Category icon' })).toBeDefined();
  });

  it('shows the selected icon', () => {
    const { container } = render(
      <IconPicker value="bell" onChange={() => {}} options={options} aria-label="Category icon" />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('opens the popover grid on trigger click', () => {
    render(
      <IconPicker value={null} onChange={() => {}} options={options} aria-label="Category icon" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Category icon' }));
    expect(screen.getByRole('listbox', { name: 'Category icon' })).toBeDefined();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('selecting an option calls onChange and closes the popover', () => {
    const onChange = vi.fn();
    render(
      <IconPicker value={null} onChange={onChange} options={options} aria-label="Category icon" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Category icon' }));
    const [, settingsOption] = screen.getAllByRole('option');
    fireEvent.click(settingsOption as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('settings');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('marks the currently selected option with aria-selected', () => {
    render(
      <IconPicker
        value="settings"
        onChange={() => {}}
        options={options}
        aria-label="Category icon"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Category icon' }));
    const opts = screen.getAllByRole('option');
    expect(opts[0]?.getAttribute('aria-selected')).toBe('false');
    expect(opts[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('disables the trigger when disabled', () => {
    render(
      <IconPicker
        value={null}
        onChange={() => {}}
        options={options}
        aria-label="Category icon"
        disabled
      />,
    );
    expect(
      (screen.getByRole('button', { name: 'Category icon' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('renders the triggerLabel when provided', () => {
    render(
      <IconPicker
        value={null}
        onChange={() => {}}
        options={options}
        aria-label="Category icon"
        triggerLabel="Groceries"
      />,
    );
    expect(screen.getByText('Groceries')).toBeDefined();
  });
});
