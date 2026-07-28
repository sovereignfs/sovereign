// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Menubar } from '../Menubar';

afterEach(cleanup);

describe('Menubar', () => {
  it('opens a menu on trigger click, showing its items', () => {
    render(<Menubar menus={[{ label: 'File', items: [{ label: 'New', onSelect: () => {} }] }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.getByRole('menuitem', { name: 'New' })).toBeDefined();
  });

  it('selecting an item calls onSelect and closes the menu', () => {
    const onSelect = vi.fn();
    render(<Menubar menus={[{ label: 'File', items: [{ label: 'New', onSelect }] }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New' }));
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: 'New' })).toBeNull();
  });

  it('switches directly between menus on hover once one is open, like a real menu bar', () => {
    render(
      <Menubar
        menus={[
          { label: 'File', items: [{ label: 'New', onSelect: () => {} }] },
          { label: 'Edit', items: [{ label: 'Undo', onSelect: () => {} }] },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.getByRole('menuitem', { name: 'New' })).toBeDefined();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('menuitem', { name: 'Undo' })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: 'New' })).toBeNull();
  });

  it('defaults to an accessible "Menu bar" label', () => {
    render(<Menubar menus={[{ label: 'File', items: [] }]} />);
    expect(screen.getByRole('navigation', { name: 'Menu bar' })).toBeDefined();
  });
});
