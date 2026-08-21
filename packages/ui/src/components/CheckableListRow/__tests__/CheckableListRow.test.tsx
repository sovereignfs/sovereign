// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CheckableListRow } from '../CheckableListRow';

afterEach(cleanup);

describe('CheckableListRow', () => {
  it('renders the label', () => {
    render(<CheckableListRow checked={false} onCheckedChange={() => {}} label="Milk" />);
    expect(screen.getByText('Milk')).toBeDefined();
  });

  it('exposes role="checkbox" with the label as its accessible name', () => {
    render(<CheckableListRow checked={false} onCheckedChange={() => {}} label="Milk" />);
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeDefined();
  });

  it('reflects checked state via aria-checked', () => {
    render(<CheckableListRow checked label="Milk" onCheckedChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Milk' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('calls onCheckedChange with the toggled value on click', () => {
    const onCheckedChange = vi.fn();
    render(<CheckableListRow checked={false} onCheckedChange={onCheckedChange} label="Milk" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('calls onCheckedChange on Space keydown', () => {
    const onCheckedChange = vi.fn();
    render(<CheckableListRow checked={false} onCheckedChange={onCheckedChange} label="Milk" />);
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Milk' }), { key: ' ' });
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does not toggle when disabled', () => {
    const onCheckedChange = vi.fn();
    render(
      <CheckableListRow checked={false} onCheckedChange={onCheckedChange} label="Milk" disabled />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('renders trailing content outside the checkbox role', () => {
    render(
      <CheckableListRow
        checked={false}
        onCheckedChange={() => {}}
        label="Milk"
        trailing={<button>x2</button>}
      />,
    );
    const trailingButton = screen.getByRole('button', { name: 'x2' });
    const checkboxRow = screen.getByRole('checkbox', { name: 'Milk' });
    expect(checkboxRow.contains(trailingButton)).toBe(false);
  });
});
