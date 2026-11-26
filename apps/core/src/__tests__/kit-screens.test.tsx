// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillUnannounced } from './fill-unannounced';

const keys = {
  unlockWithAnyPasskey: vi.fn(),
  unlockWithKitTyped: vi.fn(),
  unlockWithPasswordAgain: vi.fn(),
};
vi.mock('../keys/session', () => keys);
const derive = vi.fn();
vi.mock('../auth/derive', () => ({
  deriveForSignIn: (password: string, email: string) => {
    derive(password, email);
    return Promise.resolve({ signIn: 'svp1.x', secret: `secret:${password}` });
  },
}));

const { Unlock } = await import('../../app/keys/kit-screens');

beforeEach(() => {
  for (const mock of [...Object.values(keys), derive]) mock.mockReset();
});
afterEach(cleanup);

const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
const show = (onUnlocked = vi.fn()) => {
  render(
    <Unlock lead="Unlock." email="ada@sovereign.local" rpId="id.example" onUnlocked={onUnlocked} />,
  );
  return onUnlocked;
};

describe('unlocking encrypted data (core-app §5.5)', () => {
  it('unlocks with what is in the password box when it was filled without a word to the page, and leaves it there', async () => {
    keys.unlockWithPasswordAgain.mockResolvedValue(false);
    show();
    fillUnannounced(box('Password'), 'correct horse');
    send();
    expect((await screen.findByRole('alert')).textContent).toContain('doesn’t unlock');
    expect(derive).toHaveBeenCalledWith('correct horse', 'ada@sovereign.local');
    expect(keys.unlockWithPasswordAgain).toHaveBeenCalledWith('secret:correct horse');
    expect(box('Password').value).toBe('correct horse');
  });

  it('unlocks with the kit and a password filled the same way', async () => {
    keys.unlockWithKitTyped.mockResolvedValue('unlocked');
    const onUnlocked = show();
    fireEvent.click(screen.getByRole('button', { name: 'Use your recovery kit' }));
    fireEvent.change(screen.getByLabelText(/^Recovery kit/), { target: { value: 'ABCD-EFGH' } });
    fillUnannounced(box('Password'), 'correct horse');
    send();
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(derive).toHaveBeenCalledWith('correct horse', 'ada@sovereign.local');
    expect(keys.unlockWithKitTyped).toHaveBeenCalledWith('ABCD-EFGH', 'secret:correct horse');
  });
});
