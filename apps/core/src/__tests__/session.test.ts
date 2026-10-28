import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers({ cookie: 'a=b' })) }));
vi.mock('../auth/index', () => ({
  getAuth: () =>
    Promise.resolve({ api: { getSession: (options: unknown) => getSession(options) } }),
}));

import { getSession as sessionForRequest } from '../auth/session';

beforeEach(() => getSession.mockReset().mockResolvedValue(null));

describe("core's own session check", () => {
  it('asks the database, never the signed cookie cache, so an ended session stops working at once', async () => {
    await sessionForRequest();
    expect(getSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
  });

  it("reads the request's own cookies", async () => {
    await sessionForRequest();
    const options = getSession.mock.calls[0]?.[0] as { headers: Headers };
    expect(options.headers.get('cookie')).toBe('a=b');
  });
});
