// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Popover } from '../Popover';

afterEach(cleanup);

const trigger = <button type="button">Open</button>;

describe('Popover', () => {
  it('renders the trigger element', () => {
    render(
      <Popover open={false} onClose={() => {}} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeDefined();
  });

  it('does not render the panel when closed', () => {
    render(
      <Popover open={false} onClose={() => {}} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the panel with children when open', () => {
    render(
      <Popover open={true} onClose={() => {}} aria-label="Menu" trigger={trigger}>
        Panel content
      </Popover>,
    );
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeDefined();
    expect(screen.getByText('Panel content')).toBeDefined();
  });

  it('applies the right alignment class by default', () => {
    render(
      <Popover open={true} onClose={() => {}} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    expect(screen.getByRole('dialog').className).toContain('right');
  });

  it('applies the left alignment class when specified', () => {
    render(
      <Popover open={true} onClose={() => {}} align="left" aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    expect(screen.getByRole('dialog').className).toContain('left');
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Popover open={true} onClose={onClose} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when clicking outside the container', () => {
    const onClose = vi.fn();
    render(
      <Popover open={true} onClose={onClose} aria-label="Menu" trigger={trigger}>
        Content
      </Popover>,
    );
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking inside the panel', () => {
    const onClose = vi.fn();
    render(
      <Popover open={true} onClose={onClose} aria-label="Menu" trigger={trigger}>
        <button type="button">Inside</button>
      </Popover>,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies the provided width as inline style', () => {
    render(
      <Popover open={true} onClose={() => {}} aria-label="Menu" width={320} trigger={trigger}>
        Content
      </Popover>,
    );
    expect((screen.getByRole('dialog') as HTMLElement).style.width).toBe('320px');
  });
});
