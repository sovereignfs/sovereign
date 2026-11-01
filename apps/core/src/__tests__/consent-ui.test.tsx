// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const consent = vi.fn();
vi.mock('../auth/client', () => ({
  authClient: { oauth2: { consent: (input: unknown) => consent(input) as unknown } },
}));

const { ConsentForm } = await import('../../app/consent/consent-form');

const assign = vi.fn();
beforeEach(() => {
  consent.mockReset();
  assign.mockReset();
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = (props: Partial<Parameters<typeof ConsentForm>[0]> = {}) =>
  render(
    <ConsentForm
      appName="Notes"
      returnHost="notes.sovereign.local"
      email="ada@sovereign.local"
      permissions={['See your name, picture, language and time zone', 'See your email address']}
      scopes={['openid', 'profile', 'email']}
      {...props}
    />,
  );

describe('the consent form', () => {
  it('says which app asks, as whom, what it would be able to do, and where the person goes next', () => {
    show();
    expect(screen.getByText('Notes')).toBeTruthy();
    expect(screen.getByText(/ada@sovereign\.local/)).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'See your name, picture, language and time zone',
      'See your email address',
    ]);
    expect(screen.getByText(/notes\.sovereign\.local/)).toBeTruthy();
    expect(screen.getByText(/does not see your password/)).toBeTruthy();
  });

  it('calls an app with no name an app, never by its address or a blank', () => {
    show({ appName: undefined });
    expect(screen.getByText('An app')).toBeTruthy();
  });

  it('allows what was offered and goes where the provider says', async () => {
    consent.mockResolvedValue({
      data: { redirect: true, url: 'https://notes.sovereign.local/cb?code=one&state=two' },
      error: null,
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://notes.sovereign.local/cb?code=one&state=two'),
    );
    expect(consent).toHaveBeenCalledWith({ accept: true, scope: 'openid profile email' });
  });

  it('refuses on request and goes where the provider says, which is back to the app with a refusal', async () => {
    consent.mockResolvedValue({
      data: { redirect: true, url: 'https://notes.sovereign.local/cb?error=access_denied' },
      error: null,
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Don’t allow' }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://notes.sovereign.local/cb?error=access_denied'),
    );
    expect(consent).toHaveBeenCalledWith({ accept: false });
  });

  it('offers only what the page offered: roles is never sent from here', async () => {
    consent.mockResolvedValue({
      data: { redirect: true, url: 'https://x.example/cb' },
      error: null,
    });
    show({ scopes: ['openid', 'profile'] });
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(consent).toHaveBeenCalled());
    expect(JSON.stringify(consent.mock.calls)).not.toContain('roles');
  });

  it('stops the buttons while it waits, so an answer is given once', async () => {
    consent.mockReturnValue(new Promise(() => undefined));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Don’t allow' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect(screen.getByText('Allowing…')).toBeTruthy();
    expect(consent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an error', { data: null, error: { status: 400 } }, /could not be done/],
    ['no address to go to', { data: {}, error: null }, /could not be done/],
    ['a limit reached', { data: null, error: { status: 429 } }, /Too many attempts/],
  ])('says so plainly when there is %s, and stays put', async (_name, reply, words) => {
    consent.mockResolvedValue(reply);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(words);
    expect(assign).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Allow' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
