// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Drawer } from '../Drawer';

describe('Drawer', () => {
  afterEach(cleanup);

  it('renders nothing when closed', () => {
    render(
      <Drawer open={false} onClose={() => {}}>
        Body
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the panel with its accessible name when open', () => {
    render(
      <Drawer open onClose={() => {}} aria-label="Navigation">
        Body
      </Drawer>,
    );
    const panel = screen.getByRole('dialog', { name: 'Navigation' });
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose}>
        Body
      </Drawer>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on scrim click but not on panel click', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Drawer open onClose={onClose} aria-label="Nav">
        <button>Action</button>
      </Drawer>,
    );
    // The scrim is the outermost div; the panel is a child.
    fireEvent.click(screen.getByRole('dialog')); // panel — should not close
    expect(onClose).not.toHaveBeenCalled();
    // Click the scrim background (the container's first child).
    const scrim = container.firstElementChild as HTMLElement;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
