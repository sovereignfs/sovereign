// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Collapsible } from '../Collapsible';

afterEach(cleanup);

describe('Collapsible', () => {
  it('exposes aria-expanded matching the open prop', () => {
    const { rerender } = render(
      <Collapsible open={false} onOpenChange={() => {}} trigger="More info">
        Body content
      </Collapsible>,
    );
    expect(screen.getByRole('button', { name: 'More info' }).getAttribute('aria-expanded')).toBe(
      'false',
    );

    rerender(
      <Collapsible open onOpenChange={() => {}} trigger="More info">
        Body content
      </Collapsible>,
    );
    expect(screen.getByRole('button', { name: 'More info' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('calls onOpenChange with the toggled value when the trigger is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <Collapsible open={false} onOpenChange={onOpenChange} trigger="More info">
        Body content
      </Collapsible>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More info' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('marks collapsed content inert', () => {
    render(
      <Collapsible open={false} onOpenChange={() => {}} trigger="More info">
        Body content
      </Collapsible>,
    );
    const content = screen.getByText('Body content').closest('[inert]');
    expect(content).not.toBeNull();
  });

  it('does not mark expanded content inert', () => {
    render(
      <Collapsible open onOpenChange={() => {}} trigger="More info">
        Body content
      </Collapsible>,
    );
    const content = screen.getByText('Body content').closest('[inert]');
    expect(content).toBeNull();
  });

  it('associates the trigger with the content via aria-controls', () => {
    render(
      <Collapsible open onOpenChange={() => {}} trigger="More info" id="details">
        Body content
      </Collapsible>,
    );
    const button = screen.getByRole('button', { name: 'More info' });
    const controlsId = button.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId ?? '')).not.toBeNull();
  });
});
