// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillUnannounced } from './fill-unannounced';

const derive = vi.fn();
vi.mock('../auth/derive', () => ({
  deriveForSignIn: (password: string, email: string) => {
    derive(password, email);
    return Promise.resolve({ signIn: `derived:${password}`, secret: 'secret' });
  },
}));
vi.mock('../auth/client', () => ({ authClient: { signOut: vi.fn() } }));
vi.mock('../keys/session', () => ({
  afterPasskeyAccepted: vi.fn(),
  afterPasswordAccepted: vi.fn(),
  forgetKeys: vi.fn(),
}));
vi.mock('../lock/ceremony', () => ({ askForPasskey: vi.fn() }));
const unlock = vi.fn();
vi.mock('../../app/(auth)/lock/actions', () => ({
  unlockWithPassword: (value: unknown) => unlock(value) as unknown,
  unlockChallenge: vi.fn(),
  unlockWithPasskey: vi.fn(),
}));

const { LockForm } = await import('../../app/(auth)/lock/lock-form');

const assign = vi.fn();
beforeEach(() => {
  for (const mock of [derive, unlock, assign]) mock.mockReset();
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const box = () => screen.getByLabelText('Password') as HTMLInputElement;
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Use your password' }));

describe('the lock page’s password (RFC 0006 B4)', () => {
  it('cannot be sent from the page as the server sends it: the browser would put it in the address', () => {
    const page = document.createElement('div');
    page.innerHTML = renderToString(<LockForm returnTo="/files" email="ada@sovereign.local" />);
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    // And if a script sends it all the same, nothing of it goes in the address.
    expect(page.querySelector('form')?.getAttribute('method')).toBe('post');
  });

  it('unlocks with what was typed, and goes on to where the person was', async () => {
    unlock.mockResolvedValue({ ok: true });
    render(<LockForm returnTo="/files" email="ada@sovereign.local" />);
    fireEvent.change(box(), { target: { value: 'correct horse' } });
    send();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/files'));
    expect(unlock).toHaveBeenCalledWith('derived:correct horse');
  });

  it('unlocks with what is in the box when it was filled without a word to the page, and leaves it there', async () => {
    unlock.mockResolvedValue({ ok: false, reason: 'wrong' });
    render(<LockForm returnTo="/files" email="ada@sovereign.local" />);
    fillUnannounced(box(), 'correct horse');
    send();
    expect((await screen.findByRole('alert')).textContent).toContain('That password is not right.');
    expect(derive).toHaveBeenCalledWith('correct horse', 'ada@sovereign.local');
    expect(unlock).toHaveBeenCalledWith('derived:correct horse');
    expect(box().value).toBe('correct horse');
  });
});
