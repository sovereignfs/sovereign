// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PushControl, type PushControlState } from '../PushControl';

afterEach(cleanup);

const props = (state: PushControlState) => ({
  appName: 'Tasks',
  state,
  onTurnOn: vi.fn(),
  onTurnOff: vi.fn(),
});

describe('PushControl', () => {
  it('shows nothing while checking, or when the app sends no notifications', () => {
    for (const state of ['checking', 'unavailable'] as const) {
      const { container } = render(<PushControl {...props(state)} />);
      expect(container.innerHTML).toBe('');
      cleanup();
    }
  });

  it('says plainly why a device cannot have notifications', () => {
    const words: [PushControlState, RegExp][] = [
      ['unsupported', /This browser can’t show notifications from Tasks\./],
      ['insecure', /need a secure \(https\) connection/],
      [
        'install-first',
        /add Tasks to your Home Screen first: tap Share, then Add to Home Screen\./,
      ],
      ['blocked', /blocked for Tasks in this browser’s settings/],
    ];
    for (const [state, text] of words) {
      render(<PushControl {...props(state)} />);
      expect(
        screen.getByRole('region', { name: 'Notifications on this device' }).textContent,
      ).toMatch(text);
      expect(screen.queryByRole('switch')).toBeNull();
      cleanup();
    }
  });

  it('is a switch with a label and a description, which turns on and off', () => {
    const off = props('off');
    render(<PushControl {...off} />);
    const toggle = screen.getByRole('switch', { name: 'Notifications from Tasks on this device' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    const description = document.getElementById(toggle.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe(
      'Get notifications from Tasks on this device, even when it isn’t open.',
    );
    fireEvent.click(toggle);
    expect(off.onTurnOn).toHaveBeenCalled();
    cleanup();

    const on = props('on');
    render(<PushControl {...on} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(on.onTurnOff).toHaveBeenCalled();
  });

  it('is busy while working, and says why it failed, read with the switch', () => {
    render(
      <PushControl
        {...props('off')}
        working
        error="Notifications couldn’t be turned on. Try again."
      />,
    );
    const toggle = screen.getByRole('switch');
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(toggle.getAttribute('aria-busy')).toBe('true');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Notifications couldn’t be turned on. Try again.');
    expect(toggle.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('shows what the app adds, only beside the switch', () => {
    render(
      <PushControl {...props('on')}>
        <button type="button">Send me a test notification</button>
      </PushControl>,
    );
    expect(screen.getByRole('button', { name: 'Send me a test notification' })).toBeTruthy();
    cleanup();
    render(
      <PushControl {...props('blocked')}>
        <button type="button">Send me a test notification</button>
      </PushControl>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
