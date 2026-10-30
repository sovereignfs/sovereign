// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemberMultiSelect } from '../MemberMultiSelect';

afterEach(cleanup);

const OPTIONS = [
  { id: 'a', label: 'Ada' },
  { id: 'g', label: 'Grace' },
  { id: 'l', label: 'Linus' },
];

describe('MemberMultiSelect', () => {
  it('lists every option as a checkbox, ticked for the ones selected', () => {
    render(
      <MemberMultiSelect options={OPTIONS} selectedIds={new Set(['g'])} onToggle={() => {}} />,
    );
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([false, true, false]);
    expect(screen.getByRole('checkbox', { name: 'Linus' })).toBeDefined();
  });

  it('reports which option was toggled, and to what', () => {
    const onToggle = vi.fn();
    render(
      <MemberMultiSelect options={OPTIONS} selectedIds={new Set(['g'])} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ada' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Grace' }));
    expect(onToggle).toHaveBeenNthCalledWith(1, 'a', true);
    expect(onToggle).toHaveBeenNthCalledWith(2, 'g', false);
  });

  it('shows trailing content only beside the options that are selected', () => {
    render(
      <MemberMultiSelect
        options={OPTIONS}
        selectedIds={new Set(['a', 'l'])}
        onToggle={() => {}}
        renderTrailing={(id) => <span data-testid="extra">share of {id}</span>}
      />,
    );
    expect(screen.getAllByTestId('extra').map((node) => node.textContent)).toEqual([
      'share of a',
      'share of l',
    ]);
  });

  it('shows a label and a hint when given, and none otherwise', () => {
    const { container } = render(
      <MemberMultiSelect
        options={OPTIONS}
        selectedIds={new Set()}
        onToggle={() => {}}
        label="Who was there?"
        hint="Pick at least one."
        className="mine"
      />,
    );
    expect(screen.getByText('Who was there?')).toBeDefined();
    expect(screen.getByText('Pick at least one.')).toBeDefined();
    expect((container.firstChild as HTMLElement).className).toContain('mine');
    cleanup();
    render(<MemberMultiSelect options={OPTIONS} selectedIds={new Set()} onToggle={() => {}} />);
    expect(screen.queryByText('Who was there?')).toBeNull();
  });
});
