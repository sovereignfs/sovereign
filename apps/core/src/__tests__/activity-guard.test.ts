import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';

const authenticateApp = vi.fn();
vi.mock('../api/token', () => ({
  authenticateApp: (...args: unknown[]) => authenticateApp(...args) as unknown,
}));
vi.mock('../directory/service', () => ({ getTokenDeps: () => Promise.resolve({}) }));

const { activityGuard, apiErrorOf, ACTIVITY_SCOPE } = await import('../activity/api');
const { ActivityError } = await import('../activity/service');

const request = new Request('http://localhost:3000/api/v1/activity', { method: 'POST' });

beforeEach(() => {
  authenticateApp.mockReset().mockResolvedValue({ clientId: 'app', scopes: [ACTIVITY_SCOPE] });
});

describe('the check the activity call makes first', () => {
  it('asks for an app’s own token with activity:write', async () => {
    expect(await activityGuard(request)).toMatchObject({ clientId: 'app' });
    expect(authenticateApp).toHaveBeenCalledWith({}, request, 'activity:write');
  });

  it('turns away a token the check refuses', async () => {
    authenticateApp.mockImplementation(() =>
      Promise.reject(new ApiError(403, 'insufficient_scope', 'no')),
    );
    await expect(activityGuard(request)).rejects.toMatchObject({ status: 403 });
  });
});

describe('how the service’s refusals are answered', () => {
  it('turns each into the status the contract has, and leaves any other failure alone', () => {
    expect(apiErrorOf(new ActivityError('rate-limited', 'x', [], 30))).toMatchObject({
      status: 429,
      headers: { 'retry-after': '30' },
    });
    expect(
      apiErrorOf(new ActivityError('invalid', 'x', [{ field: 'summary', message: 'is required' }])),
    ).toMatchObject({ status: 400, message: 'summary is required' });
    const other = new Error('boom');
    expect(apiErrorOf(other)).toBe(other);
  });
});
