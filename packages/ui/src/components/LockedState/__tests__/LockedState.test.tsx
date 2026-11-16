// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LockedState } from '../LockedState';

afterEach(cleanup);

describe('LockedState', () => {
  it('says the place is locked on this browser, names the app, and offers the consumer’s way to unlock', () => {
    render(
      <LockedState reason="locked" appName="Notes" action={<a href="/auth/unlock">Unlock</a>} />,
    );
    expect(screen.getByRole('heading', { name: 'Unlock to see this' })).toBeDefined();
    expect(screen.getByText(/Notes keeps this encrypted/)).toBeDefined();
    expect(screen.getByText(/your password or a passkey/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Unlock' }).getAttribute('href')).toBe('/auth/unlock');
  });

  it('says who stopped sharing, when it knows', () => {
    render(<LockedState reason="removed" appName="Notes" sharedBy="Ada Lovelace" />);
    expect(screen.getByRole('heading', { name: 'You no longer have access' })).toBeDefined();
    expect(
      screen.getByText(
        'Ada Lovelace stopped sharing this with you. Ask them if you still need it.',
      ),
    ).toBeDefined();
  });

  it('says it without a name, and with no action when none is given', () => {
    const { container } = render(<LockedState reason="removed" appName="Notes" />);
    expect(screen.getByText(/This is no longer shared with you/)).toBeDefined();
    expect(container.querySelector('a, button')).toBeNull();
  });

  it('uses no word of how it works', () => {
    const { container } = render(
      <>
        <LockedState reason="locked" appName="Notes" />
        <LockedState reason="removed" appName="Notes" sharedBy="Ada" />
      </>,
    );
    expect(container.textContent).not.toMatch(/\b(key|vault|cipher|token|wrap|decrypt)/i);
  });
});
