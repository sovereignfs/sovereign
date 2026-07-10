// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Menu, type MenuItem } from '../Menu';

let mobile = false;
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      // useIsMobile's query is '(max-width: ...)'; everything else (e.g.
      // Drawer's prefers-reduced-motion check) defaults to false so the
      // mobile-branch Drawer isn't accidentally forced into the
      // reduced-motion path.
      matches: query.includes('max-width') ? mobile : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function installPointerCapture() {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
}

const items: MenuItem[] = [
  { label: 'Rename', onSelect: vi.fn() },
  { label: 'Delete', onSelect: vi.fn(), destructive: true },
];

describe('Menu', () => {
  beforeEach(() => {
    mobile = false;
    installMatchMedia();
    installPointerCapture();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders the trigger regardless of open state', () => {
    render(
      <Menu
        trigger={<button type="button">Open menu</button>}
        open={false}
        onClose={() => {}}
        items={items}
        aria-label="List actions"
      />,
    );
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy();
  });

  it('renders as a Popover on desktop', () => {
    render(
      <Menu
        trigger={<button type="button">Open menu</button>}
        open
        onClose={() => {}}
        items={items}
        aria-label="List actions"
      />,
    );
    const menu = screen.getByRole('dialog', { name: 'List actions' });
    // Popover's own aria-modal is explicitly false (non-modal floating panel).
    expect(menu.getAttribute('aria-modal')).toBe('false');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
  });

  it('renders as a Drawer on mobile', () => {
    mobile = true;
    installMatchMedia();
    render(
      <Menu
        trigger={<button type="button">Open menu</button>}
        open
        onClose={() => {}}
        items={items}
        aria-label="List actions"
      />,
    );
    const menu = screen.getByRole('dialog', { name: 'List actions' });
    expect(menu.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
  });

  it('calls both onClose and the item onSelect when an item is chosen', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(
      <Menu
        trigger={<button type="button">Open menu</button>}
        open
        onClose={onClose}
        items={[{ label: 'Rename', onSelect }]}
        aria-label="List actions"
      />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables an item and does not fire onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(
      <Menu
        trigger={<button type="button">Open menu</button>}
        open
        onClose={() => {}}
        items={[{ label: 'Archive', onSelect, disabled: true }]}
        aria-label="List actions"
      />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks a destructive item distinctly from a default one', () => {
    render(
      <Menu
        trigger={<button type="button">Open menu</button>}
        open
        onClose={() => {}}
        items={items}
        aria-label="List actions"
      />,
    );
    const renameClass = screen.getByRole('menuitem', { name: 'Rename' }).className;
    const deleteClass = screen.getByRole('menuitem', { name: 'Delete' }).className;
    expect(deleteClass).not.toBe(renameClass);
  });
});
