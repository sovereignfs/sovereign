// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DragHandleRow } from '../DragHandleRow';

afterEach(cleanup);

describe('DragHandleRow', () => {
  it('shows its content beside a handle named for what it does', () => {
    render(<DragHandleRow>Item one</DragHandleRow>);
    expect(screen.getByText('Item one')).toBeDefined();
    const handle = screen.getByRole('button', { name: 'Drag to reorder' });
    expect(handle.getAttribute('type')).toBe('button');
  });

  it('leaves the handle out of the tab order unless the caller makes it a stop', () => {
    render(<DragHandleRow>Item one</DragHandleRow>);
    expect(screen.getByRole('button').getAttribute('tabindex')).toBe('-1');
    cleanup();
    render(<DragHandleRow handleProps={{ tabIndex: 0 }}>Item one</DragHandleRow>);
    expect(screen.getByRole('button').getAttribute('tabindex')).toBe('0');
  });

  it('gives the handle what a drag library hands out', () => {
    const onPointerDown = vi.fn();
    render(
      <DragHandleRow handleProps={{ onPointerDown, 'aria-label': 'Move this item' }}>
        Item one
      </DragHandleRow>,
    );
    const handle = screen.getByRole('button', { name: 'Move this item' });
    fireEvent.pointerDown(handle);
    expect(onPointerDown).toHaveBeenCalledOnce();
  });

  it('shows that it is being dragged, and keeps the caller’s class and attributes', () => {
    render(
      <DragHandleRow isDragging className="mine" data-testid="row">
        Item one
      </DragHandleRow>,
    );
    const row = screen.getByTestId('row');
    expect(row.className).toContain('dragging');
    expect(row.className).toContain('mine');
  });
});
