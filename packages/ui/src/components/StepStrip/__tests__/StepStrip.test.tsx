// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StepStrip } from '../StepStrip';

afterEach(cleanup);

const ITEMS = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
const renderItem = (item: { id: string }, state: { isActive: boolean; index: number }) => (
  <span data-testid={item.id} data-active={state.isActive} data-index={state.index}>
    {item.id}
  </span>
);

describe('StepStrip', () => {
  it('is a list of the steps, in order, named for what it is', () => {
    render(<StepStrip items={ITEMS} activeId="two" renderItem={renderItem} aria-label="Steps" />);
    expect(screen.getByRole('list', { name: 'Steps' })).toBeDefined();
    expect(screen.getAllByRole('listitem').map((node) => node.textContent)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('tells each step whether it is the active one, and where it is', () => {
    render(<StepStrip items={ITEMS} activeId="two" renderItem={renderItem} />);
    expect(screen.getByTestId('one').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('two').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('three').getAttribute('data-index')).toBe('2');
  });

  it('has no step active when none is named', () => {
    render(<StepStrip items={ITEMS} activeId={null} renderItem={renderItem} />);
    expect(
      screen
        .getAllByTestId(/one|two|three/)
        .every((node) => node.getAttribute('data-active') === 'false'),
    ).toBe(true);
  });

  it('joins the steps with connectors that assistive technology skips, and none after the last', () => {
    const { container } = render(
      <StepStrip items={ITEMS} activeId={null} renderItem={renderItem} />,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it('offers an add button only when it can add, and says what it adds', () => {
    const onAdd = vi.fn();
    const { container } = render(
      <StepStrip
        items={ITEMS}
        activeId={null}
        renderItem={renderItem}
        onAdd={onAdd}
        addLabel="Add step"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    expect(onAdd).toHaveBeenCalledOnce();
    // The add button follows the last step with a connector of its own.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
    cleanup();
    render(<StepStrip items={ITEMS} activeId={null} renderItem={renderItem} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('adds with the default label', () => {
    render(<StepStrip items={[]} activeId={null} renderItem={renderItem} onAdd={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDefined();
  });
});
