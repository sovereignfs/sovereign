// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The vault and the keys have their own tests (keys-unlock, key-vault); here they answer as told.
const keys = {
  isKitPending: vi.fn(),
  isUnlocked: vi.fn(),
  isEscrowOn: vi.fn(),
  kitKept: vi.fn(),
  unlockWithAnyPasskey: vi.fn(),
  unlockWithKitTyped: vi.fn(),
  unlockWithPasswordAgain: vi.fn(),
};
vi.mock('../keys/session', () => keys);
vi.mock('../auth/derive', () => ({
  deriveForSignIn: () => Promise.resolve({ signIn: 'svp1.x', secret: 'secret' }),
}));

const { KitFlow } = await import('../../app/keys/kit/kit-flow');

const replace = vi.fn();
beforeEach(() => {
  for (const mock of [...Object.values(keys), replace]) mock.mockReset();
  vi.stubGlobal('location', { ...window.location, replace });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = () =>
  render(
    <KitFlow instanceName="Acme" email="ada@sovereign.local" rpId="id.example" returnTo="/files" />,
  );
const keepIt = async () => {
  fireEvent.click(await screen.findByRole('checkbox', { name: /kept my recovery kit/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
};

describe('the recovery kit page (core-app §5.3)', () => {
  it('goes straight on for someone with nothing to keep', async () => {
    keys.isKitPending.mockResolvedValue(false);
    show();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/files'));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('shows the kit, offers no way past it, and goes on once it is kept', async () => {
    keys.isKitPending.mockResolvedValue(true);
    keys.isUnlocked.mockResolvedValue(true);
    keys.kitKept.mockResolvedValue(true);
    show();
    await screen.findByRole('checkbox', { name: /kept my recovery kit/ });
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: /later|skip|not now/i })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    await keepIt();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/files'));
    expect(keys.kitKept).toHaveBeenCalledTimes(1);
  });

  it('says so when the kit could not be saved, and makes another on request', async () => {
    keys.isKitPending.mockResolvedValue(true);
    keys.isUnlocked.mockResolvedValue(true);
    keys.kitKept.mockResolvedValue(false);
    show();
    await keepIt();
    expect((await screen.findByRole('alert')).textContent).toContain('couldn’t be saved');
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('checkbox', { name: /kept my recovery kit/ })).toBeTruthy();
  });

  it('asks a locked browser to unlock first, without offering the kit nobody has yet', async () => {
    keys.isKitPending.mockResolvedValue(true);
    keys.isUnlocked.mockResolvedValue(false);
    show();
    expect(await screen.findByRole('button', { name: 'Unlock' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use your recovery kit' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
