import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../auth/authorize';
import { refusedForm, shortcutFromForm } from '../shortcuts/form';
import { MAX_SHORTCUT_ICON_BYTES, ShortcutError } from '../shortcuts/manager';

const requireCapability = vi.fn();
vi.mock('../auth/authorize', async (original) => ({
  ...(await original<typeof import('../auth/authorize')>()),
  requireCapability: (capability: string) => requireCapability(capability) as unknown,
}));
const icon = vi.fn();
vi.mock('../shortcuts', () => ({
  getShortcutManager: () => Promise.resolve({ icon }),
}));

const { GET } = await import('../../app/api/shortcuts/[id]/icon/route');

const ID = '0b9f6c1e-3f7a-4d2b-9c1a-2e5f8a7b6c4d';
const get = (id: string, headers: Record<string, string> = {}) =>
  GET(new Request(`https://core.example/api/shortcuts/${id}/icon?v=1`, { headers }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  requireCapability.mockReset().mockResolvedValue({ user: { id: 'u-ada', role: 'platform:user' } });
  icon.mockReset().mockResolvedValue({
    contentType: 'image/png',
    bytes: Buffer.from('png'),
    version: 'abc',
  });
});

describe('a shortcut’s picture', () => {
  it('is served to a person with the launcher, asked for with their own id, as its bytes proved it to be', async () => {
    const response = await get(ID);
    expect(response.status).toBe(200);
    expect(requireCapability).toHaveBeenCalledWith('launcher:access');
    expect(icon).toHaveBeenCalledWith('u-ada', ID);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
  });

  it('is not there when the manager finds none for this person: another’s own, or none at all', async () => {
    icon.mockResolvedValue(undefined);
    expect((await get(ID)).status).toBe(404);
  });

  it('is not looked for under an id that is not one', async () => {
    expect((await get('../../etc')).status).toBe(404);
    expect(icon).not.toHaveBeenCalled();
  });

  it('is refused to someone not signed in, or without the launcher', async () => {
    requireCapability.mockRejectedValue(new AuthorizationError('unauthenticated'));
    expect((await get(ID)).status).toBe(401);
    requireCapability.mockRejectedValue(new AuthorizationError('forbidden', 'launcher:access'));
    expect((await get(ID)).status).toBe(403);
    expect(icon).not.toHaveBeenCalled();
  });

  it('answers a revalidation with 304', async () => {
    expect((await get(ID, { 'if-none-match': '"abc"' })).status).toBe(304);
  });
});

describe('the shortcut form', () => {
  const form = (fields: Record<string, string | File>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return data;
  };

  it('takes a symbol only when an icon was chosen, and keeps the picture when asked', async () => {
    expect(
      await shortcutFromForm(
        form({ name: 'Drive', url: ' https://drive.proton.me ', icon: 'symbol', symbol: 'link' }),
      ),
    ).toEqual({
      name: 'Drive',
      url: 'https://drive.proton.me',
      description: undefined,
      symbol: 'link',
    });
    expect(
      await shortcutFromForm(form({ name: 'Drive', url: 'x', icon: 'none', symbol: 'link' })),
    ).not.toHaveProperty('symbol');
    expect(await shortcutFromForm(form({ name: 'Drive', url: 'x', icon: 'keep' }))).toMatchObject({
      keepImage: true,
    });
  });

  it('reads an uploaded picture, and refuses one too large before reading it', async () => {
    const small = new File([new Uint8Array([1, 2, 3])], 'a.png');
    expect(
      (await shortcutFromForm(form({ name: 'D', url: 'x', icon: 'image', image: small }))).image,
    ).toEqual(Buffer.from([1, 2, 3]));
    const large = new File([new Uint8Array(MAX_SHORTCUT_ICON_BYTES + 1)], 'a.png');
    await expect(
      shortcutFromForm(form({ name: 'D', url: 'x', icon: 'image', image: large })),
    ).rejects.toBeInstanceOf(ShortcutError);
    await expect(shortcutFromForm(form({ name: 'D', url: 'x', icon: 'image' }))).rejects.toThrow(
      'Choose a picture',
    );
  });

  it('puts each refusal beside its field, and throws what is not a refusal', () => {
    expect(
      refusedForm(
        new ShortcutError('invalid', 'Some of it.', [
          { field: 'url', message: 'The address must be https.' },
          { field: 'name', message: 'The name is required.' },
        ]),
      ),
    ).toEqual({
      ok: false,
      error: 'Some of it.',
      fields: { url: 'The address must be https.', name: 'The name is required.' },
    });
    expect(() => refusedForm(new Error('boom'))).toThrow('boom');
  });
});
