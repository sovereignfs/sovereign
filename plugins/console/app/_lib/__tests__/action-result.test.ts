import { describe, expect, it } from 'vitest';
import { ACTION_OK, actionError, apiErrorMessage, guarded } from '../action-result';

describe('action-result helpers', () => {
  it('guarded passes a returned result through unchanged', async () => {
    await expect(guarded(async () => ACTION_OK)).resolves.toEqual({ ok: true });
    await expect(guarded(async () => ({ ok: false, error: 'nope' }))).resolves.toEqual({
      ok: false,
      error: 'nope',
    });
  });

  it('guarded turns a throw into { ok: false } carrying the message', async () => {
    await expect(
      guarded(async () => {
        throw new Error('auth server unreachable');
      }),
    ).resolves.toEqual({ ok: false, error: 'auth server unreachable' });
  });

  it('actionError falls back to a generic message for a blank or non-Error throw', () => {
    expect(actionError(new Error(''))).toEqual({ ok: false, error: 'Something went wrong.' });
    expect(actionError(42)).toEqual({ ok: false, error: 'Something went wrong.' });
    expect(actionError('plain string')).toEqual({ ok: false, error: 'plain string' });
  });

  it('apiErrorMessage prefers the body error and falls back to the status', async () => {
    await expect(
      apiErrorMessage(
        new Response(JSON.stringify({ error: 'group not found' }), { status: 404 }),
        'Failed',
      ),
    ).resolves.toBe('group not found');
    await expect(
      apiErrorMessage(new Response('not json', { status: 502 }), 'Failed'),
    ).resolves.toBe('Failed: 502');
  });
});
