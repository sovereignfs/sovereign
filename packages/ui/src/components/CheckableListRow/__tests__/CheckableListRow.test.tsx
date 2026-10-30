// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CheckableListRow } from '../CheckableListRow';

afterEach(cleanup);

const row = (props: Partial<Parameters<typeof CheckableListRow>[0]> = {}) => {
  const onCheckedChange = vi.fn();
  render(
    <CheckableListRow
      checked={false}
      onCheckedChange={onCheckedChange}
      label="Buy milk"
      {...props}
    />,
  );
  return { onCheckedChange, box: screen.getByRole('checkbox', { name: 'Buy milk' }) };
};

describe('CheckableListRow', () => {
  it('is a checkbox named for the row, in its state', () => {
    const { box } = row({ checked: true });
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect(box.getAttribute('tabindex')).toBe('0');
  });

  it('turns over on a click', () => {
    const { box, onCheckedChange } = row();
    fireEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('turns over on Space and on Enter, and not on another key', () => {
    const { box, onCheckedChange } = row({ checked: true });
    fireEvent.keyDown(box, { key: ' ' });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'a' });
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('does nothing when disabled, and is not a tab stop', () => {
    const { box, onCheckedChange } = row({ disabled: true });
    fireEvent.click(box);
    fireEvent.keyDown(box, { key: ' ' });
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(box.getAttribute('aria-disabled')).toBe('true');
    expect(box.getAttribute('tabindex')).toBe('-1');
  });

  it('strikes the label through when checked, and shows an icon and trailing content', () => {
    row({ checked: true, icon: <i data-testid="icon" />, trailing: <button>More</button> });
    expect(screen.getByText('Buy milk').className).toContain('struck');
    expect(screen.getByTestId('icon')).toBeDefined();
    expect(screen.getByRole('button', { name: 'More' })).toBeDefined();
  });

  it('keeps trailing content outside the tap target, so using it does not turn the row over', () => {
    const { onCheckedChange } = row({ trailing: <button>More</button> });
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
