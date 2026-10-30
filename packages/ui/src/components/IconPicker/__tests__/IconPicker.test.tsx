// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IconName } from '../../Icon/Icon';
import { IconPicker } from '../IconPicker';

afterEach(cleanup);

const OPTIONS: IconName[] = ['house', 'settings', 'user'];

function Picker({
  initial = null as IconName | null,
  onChange = (_icon: IconName) => {},
  disabled = false,
}) {
  const [value, setValue] = useState<IconName | null>(initial);
  return (
    <IconPicker
      value={value}
      options={OPTIONS}
      aria-label="Icon"
      disabled={disabled}
      onChange={(icon) => {
        setValue(icon);
        onChange(icon);
      }}
    />
  );
}

describe('IconPicker', () => {
  it('is a button that says it opens something, closed at first', () => {
    render(<Picker />);
    const trigger = screen.getByRole('button', { name: 'Icon' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens a list of the options, and marks the chosen one', () => {
    render(<Picker initial="settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Icon' }));
    expect(screen.getByRole('button', { name: 'Icon' }).getAttribute('aria-expanded')).toBe('true');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
  });

  it('reports the choice and closes', () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Icon' }));
    fireEvent.click(screen.getAllByRole('option')[2] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('user');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape without choosing', () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Icon' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the label next to the icon when given, and cannot be opened when disabled', () => {
    const { rerender } = render(
      <IconPicker
        value="house"
        options={OPTIONS}
        aria-label="Icon"
        triggerLabel="Change"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Change')).toBeDefined();
    rerender(
      <IconPicker value="house" options={OPTIONS} aria-label="Icon" disabled onChange={() => {}} />,
    );
    const trigger = screen.getByRole('button', { name: 'Icon' }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
