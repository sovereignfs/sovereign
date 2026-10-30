import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';

const authenticateApp = vi.fn();
vi.mock('../api/token', () => ({
  authenticateApp: (...args: unknown[]) => authenticateApp(...args) as unknown,
}));
vi.mock('../directory/service', () => ({ getTokenDeps: () => Promise.resolve({}) }));
const available = vi.fn();
vi.mock('../mail/index', () => ({
  getMailForAppsService: () => Promise.resolve({ available: () => available() as unknown }),
}));

const { emailGuard, apiErrorOf, EMAIL_SCOPE } = await import('../mail/api');
const { AppMailError } = await import('../mail/apps');

const request = new Request('http://localhost:3000/api/v1/email', { method: 'POST' });

beforeEach(() => {
  authenticateApp.mockReset().mockResolvedValue({ clientId: 'app', scopes: [EMAIL_SCOPE] });
  available.mockReset().mockResolvedValue(true);
});

describe('the check the email call makes first', () => {
  it('asks for an app’s own token with email:send', async () => {
    expect(await emailGuard(request)).toMatchObject({ clientId: 'app' });
    expect(authenticateApp).toHaveBeenCalledWith({}, request, 'email:send');
  });

  it('turns away a bad token before it says anything of the instance’s mail', async () => {
    authenticateApp.mockRejectedValue(new ApiError(401, 'invalid_token', 'no'));
    available.mockResolvedValue(false);
    await expect(emailGuard(request)).rejects.toMatchObject({ status: 401 });
    expect(available).not.toHaveBeenCalled();
  });

  it('is a 404 once the token is accepted when the instance has no mail', async () => {
    available.mockResolvedValue(false);
    await expect(emailGuard(request)).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});

describe('how the service’s refusals are answered', () => {
  it('turns each into the status the contract has, and leaves any other failure alone', () => {
    expect(apiErrorOf(new AppMailError('unavailable', 'x'))).toMatchObject({ status: 404 });
    expect(apiErrorOf(new AppMailError('rate-limited', 'x', [], 30))).toMatchObject({
      status: 429,
      headers: { 'retry-after': '30' },
    });
    expect(
      apiErrorOf(new AppMailError('invalid', 'x', [{ field: 'subject', message: 'is required' }])),
    ).toMatchObject({ status: 400, message: 'subject is required' });
    const other = new Error('boom');
    expect(apiErrorOf(other)).toBe(other);
  });
});
