// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemberMultiSelect, type MemberMultiSelectOption } from '../MemberMultiSelect';

afterEach(cleanup);

const options: MemberMultiSelectOption[] = [
  { id: 'a', label: 'Ada' },
  { id: 'b', label: 'Grace' },
];

describe('MemberMultiSelect', () => {
  it('renders a checkbox per option', () => {
    render(<MemberMultiSelect options={options} selectedIds={new Set()} onToggle={() => {}} />);
    expect(screen.getByLabelText('Ada')).toBeDefined();
    expect(screen.getByLabelText('Grace')).toBeDefined();
  });

  it('reflects selectedIds as checked state', () => {
    render(
      <MemberMultiSelect options={options} selectedIds={new Set(['a'])} onToggle={() => {}} />,
    );
    expect((screen.getByLabelText('Ada') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Grace') as HTMLInputElement).checked).toBe(false);
  });

  it('calls onToggle with the option id and new checked value', () => {
    const onToggle = vi.fn();
    render(<MemberMultiSelect options={options} selectedIds={new Set()} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText('Ada'));
    expect(onToggle).toHaveBeenCalledWith('a', true);
  });

  it('renders the label when provided', () => {
    render(
      <MemberMultiSelect
        options={options}
        selectedIds={new Set()}
        onToggle={() => {}}
        label="Split between"
      />,
    );
    expect(screen.getByText('Split between')).toBeDefined();
  });

  it('renders trailing content only for selected rows', () => {
    render(
      <MemberMultiSelect
        options={options}
        selectedIds={new Set(['a'])}
        onToggle={() => {}}
        renderTrailing={(id) => <span>trailing-{id}</span>}
      />,
    );
    expect(screen.getByText('trailing-a')).toBeDefined();
    expect(screen.queryByText('trailing-b')).toBeNull();
  });

  it('renders the hint when provided', () => {
    render(
      <MemberMultiSelect
        options={options}
        selectedIds={new Set()}
        onToggle={() => {}}
        hint="Total: $10.00"
      />,
    );
    expect(screen.getByText('Total: $10.00')).toBeDefined();
  });
});
