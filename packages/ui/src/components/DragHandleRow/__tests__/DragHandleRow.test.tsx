// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DragHandleRow } from '../DragHandleRow';

afterEach(cleanup);

describe('DragHandleRow', () => {
  it('renders its children', () => {
    render(<DragHandleRow>Row content</DragHandleRow>);
    expect(screen.getByText('Row content')).toBeDefined();
  });

  it('renders a labeled drag handle button', () => {
    render(<DragHandleRow>Row content</DragHandleRow>);
    expect(screen.getByRole('button', { name: 'Drag to reorder' })).toBeDefined();
  });

  it('applies the dragging class when isDragging is true', () => {
    const { container } = render(<DragHandleRow isDragging>Row content</DragHandleRow>);
    expect(container.firstElementChild?.className).toContain('dragging');
  });

  it('forwards handleProps to the drag handle button', () => {
    render(<DragHandleRow handleProps={{ 'aria-describedby': 'hint' }}>Row content</DragHandleRow>);
    expect(
      screen.getByRole('button', { name: 'Drag to reorder' }).getAttribute('aria-describedby'),
    ).toBe('hint');
  });

  it('forwards native div props to the row', () => {
    render(<DragHandleRow data-testid="row">Row content</DragHandleRow>);
    expect(screen.getByTestId('row')).toBeDefined();
  });
});
