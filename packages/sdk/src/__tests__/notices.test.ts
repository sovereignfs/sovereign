import { describe, expect, it, vi } from 'vitest';
import {
  ConfigurationError,
  CoreUnavailableError,
  InvalidNoticeError,
  SovereignError,
  verifyAccountDeletedToken,
  verifyLogoutToken,
} from '../index';
import { createFakeCore, memorySeen, type WrongLogoutToken } from '../testing/index';

/** A core, and the options an app gives the verifiers to ask it. */
function world(change: { fetch?: typeof fetch } = {}) {
  const core = createFakeCore();
  const seen = vi.fn(memorySeen());
  const options = {
    coreUrl: core.url,
    clientId: core.credentials.clientId,
    seen,
    fetch: change.fetch ?? core.fetch,
  };
  return { core, seen, options };
}

/** What core's `POST` to an app's address is: a form with one field. */
const post = (field: string, token?: string) =>
  new Request('https://notes.sovereign.local/auth/notice', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(token === undefined ? {} : { [field]: token }).toString(),
  });

const WRONG: WrongLogoutToken[] = [
  'signature',
  'issuer',
  'audience',
  'expired',
  'future',
  'event',
  'nonce',
  'type',
  'no-subject',
  'no-jti',
];

describe('verifyLogoutToken (sdk §9.2)', () => {
  it('returns who a token for a person names, from the POST core made or from the token itself', async () => {
    const { core, options } = world();
    expect(
      await verifyLogoutToken(post('logout_token', await core.logoutToken({ sub: 'u1' })), options),
    ).toEqual({ sub: 'u1' });
    expect(await verifyLogoutToken(await core.logoutToken({ sub: 'u2' }), options)).toEqual({
      sub: 'u2',
    });
  });

  it('returns the core session a token names, with or without the person', async () => {
    const { core, options } = world();
    expect(await verifyLogoutToken(await core.logoutToken({ sid: 's1' }), options)).toEqual({
      sid: 's1',
    });
    expect(
      await verifyLogoutToken(await core.logoutToken({ sub: 'u1', sid: 's1' }), options),
    ).toEqual({ sub: 'u1', sid: 's1' });
  });

  it.each(WRONG)('refuses a token that is wrong in this way: %s', async (way) => {
    const { core, seen, options } = world();
    const token = await core.logoutToken({ sub: 'u1' }, { wrong: way });
    await expect(verifyLogoutToken(token, options)).rejects.toBeInstanceOf(InvalidNoticeError);
    // Nothing that failed a rule is remembered, so a forged token fills no store.
    expect(seen).not.toHaveBeenCalled();
  });

  it('refuses a request that is not a POST, whatever it carries', async () => {
    const { core, seen, options } = world();
    const token = await core.logoutToken({ sub: 'u1' });
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const request = new Request('https://notes.sovereign.local/n', {
        method,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ logout_token: token }).toString(),
      });
      await expect(verifyLogoutToken(request, options), method).rejects.toBeInstanceOf(
        InvalidNoticeError,
      );
    }
    expect(seen).not.toHaveBeenCalled();
  });

  it('refuses an account-deleted token as a logout token', async () => {
    const { core, options } = world();
    await expect(
      verifyLogoutToken(await core.accountDeletedToken({ sub: 'u1' }), options),
    ).rejects.toBeInstanceOf(InvalidNoticeError);
  });

  it('refuses a token it has seen, and remembers one only after every other rule is met', async () => {
    const { core, seen, options } = world();
    const token = await core.logoutToken({ sub: 'u1' });
    await verifyLogoutToken(token, options);
    expect(seen).toHaveBeenCalledTimes(1);
    const [jti, expiresAt] = seen.mock.calls[0] as [string, number];
    expect(jti).toMatch(/^jti/);
    // Until a little after it expires, so a replay of an expired token is refused for its expiry anyway.
    expect(expiresAt).toBeGreaterThan(Date.now());
    await expect(verifyLogoutToken(token, options)).rejects.toBeInstanceOf(InvalidNoticeError);
    // A second token is a new notice.
    await expect(
      verifyLogoutToken(await core.logoutToken({ sub: 'u1' }), options),
    ).resolves.toEqual({ sub: 'u1' });
  });

  it.each([
    ['a GET', new Request('https://notes.sovereign.local/n', { method: 'GET' })],
    ['a form with no token', post('logout_token')],
    ['a form with the other notice’s field', post('account_deleted_token', 'x.y.z')],
    ['an empty token', post('logout_token', '')],
    ['something that is not a token', post('logout_token', 'not-a-token')],
  ])('refuses %s', async (_name, request) => {
    const { options } = world();
    await expect(verifyLogoutToken(request, options)).rejects.toBeInstanceOf(InvalidNoticeError);
    await expect(verifyLogoutToken('', options)).rejects.toBeInstanceOf(InvalidNoticeError);
  });
});

describe('verifyAccountDeletedToken (sdk §9.2)', () => {
  it('returns the person a token names', async () => {
    const { core, options } = world();
    expect(
      await verifyAccountDeletedToken(
        post('account_deleted_token', await core.accountDeletedToken({ sub: 'u1' })),
        options,
      ),
    ).toEqual({ sub: 'u1' });
  });

  it.each(WRONG)('refuses a token that is wrong in this way: %s', async (way) => {
    const { core, seen, options } = world();
    const token = await core.accountDeletedToken({ sub: 'u1' }, { wrong: way });
    await expect(verifyAccountDeletedToken(token, options)).rejects.toBeInstanceOf(
      InvalidNoticeError,
    );
    expect(seen).not.toHaveBeenCalled();
  });

  it('refuses a token that names a session and no person, which is a logout’s way of naming and not a deletion’s', async () => {
    const { core, seen, options } = world();
    // The fake makes it with only a `sid`, though its type says a person is wanted.
    const token = await core.accountDeletedToken({ sid: 's1' } as never);
    await expect(verifyAccountDeletedToken(token, options)).rejects.toBeInstanceOf(
      InvalidNoticeError,
    );
    expect(seen).not.toHaveBeenCalled();
  });

  it('refuses a logout token, ', async () => {
    const { core, options } = world();
    await expect(
      verifyAccountDeletedToken(await core.logoutToken({ sub: 'u1' }), options),
    ).rejects.toBeInstanceOf(InvalidNoticeError);
  });

  it('refuses a replay, and does not take a retry for one, since each attempt has its own jti', async () => {
    const { core, options } = world();
    const first = await core.accountDeletedToken({ sub: 'u1' });
    await verifyAccountDeletedToken(first, options);
    await expect(verifyAccountDeletedToken(first, options)).rejects.toBeInstanceOf(
      InvalidNoticeError,
    );
    await expect(
      verifyAccountDeletedToken(await core.accountDeletedToken({ sub: 'u1' }), options),
    ).resolves.toEqual({ sub: 'u1' });
  });

  it('reads the body of the request it is given, as a Request’s body can be read once', async () => {
    const { core, options } = world();
    const request = post('account_deleted_token', await core.accountDeletedToken({ sub: 'u1' }));
    await verifyAccountDeletedToken(request, options);
    expect(request.bodyUsed).toBe(true);
  });
});

describe('the options', () => {
  it('require seen, and name what is wrong without a value', async () => {
    const { core, options } = world();
    const { seen: _seen, ...withoutSeen } = options;
    const error = await verifyLogoutToken(
      await core.logoutToken({ sub: 'u1' }),
      withoutSeen as never,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toContain('seen is required');
    expect((error as Error).message).not.toContain(core.url);
  });

  it('require a core address and a client ID', async () => {
    const { options } = world();
    for (const bad of [
      { ...options, coreUrl: 'not a url' },
      { ...options, coreUrl: undefined },
      { ...options, clientId: '' },
    ]) {
      await expect(verifyLogoutToken('x.y.z', bad as never)).rejects.toBeInstanceOf(
        ConfigurationError,
      );
    }
  });

  it('refuse to fetch keys from anywhere but core’s own address', async () => {
    const { core, seen, options } = world();
    const asked: string[] = [];
    const error = await verifyLogoutToken(await core.logoutToken({ sub: 'u1' }), {
      ...options,
      fetch: (async (url: string, init?: RequestInit) => {
        asked.push(String(url));
        const response = await core.fetch(url, init);
        if (!String(url).endsWith('/.well-known/openid-configuration')) return response;
        const document = (await response.json()) as Record<string, unknown>;
        return Response.json({ ...document, jwks_uri: 'http://169.254.169.254/latest/jwks' });
      }) as typeof fetch,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoreUnavailableError);
    expect((error as Error).message).toContain('another address');
    expect(asked.some((url) => url.includes('169.254'))).toBe(false);
    expect(seen).not.toHaveBeenCalled();
  });

  it('refuse a core whose discovery document names another issuer', async () => {
    const { core, options } = world();
    const token = await core.logoutToken({ sub: 'u1' });
    const error = await verifyLogoutToken(token, {
      ...options,
      coreUrl: 'https://elsewhere.test',
      fetch: (async (url: string, init?: RequestInit) =>
        core.fetch(String(url).replace('https://elsewhere.test', core.url), init)) as typeof fetch,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toContain('not the issuer');
  });
});

describe('when core cannot be asked', () => {
  const unavailable = async (fetchImpl: typeof fetch) => {
    const { core, seen, options } = world({ fetch: fetchImpl });
    const token = await core.logoutToken({ sub: 'u1' });
    const error = await verifyLogoutToken(token, options).catch((e: unknown) => e);
    return { error, seen, core, token };
  };

  it('is CoreUnavailableError when the connection fails, and nothing is remembered', async () => {
    const { error, seen } = await unavailable((async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch);
    expect(error).toBeInstanceOf(CoreUnavailableError);
    expect(seen).not.toHaveBeenCalled();
  });

  it('is CoreUnavailableError when core’s discovery document or keys answer a failure, with the status', async () => {
    for (const path of ['openid-configuration', '/jwks']) {
      const core = createFakeCore();
      const { error, seen } = await unavailable(((url: string, init?: RequestInit) =>
        String(url).endsWith(path)
          ? Promise.resolve(new Response('no', { status: 503 }))
          : core.fetch(url, init)) as typeof fetch);
      // The fake core and this one are different cores, so the token they sign differs; it is the answer that is tested.
      expect(error, path).toBeInstanceOf(CoreUnavailableError);
      expect((error as CoreUnavailableError).status, path).toBe(503);
      expect(seen).not.toHaveBeenCalled();
    }
  });

  it('is CoreUnavailableError when core’s keys do not arrive in time, as a call that ran out of time fails', async () => {
    const core = createFakeCore();
    const { error, seen } = await unavailable(((url: string, init?: RequestInit) =>
      String(url).endsWith('/jwks')
        ? Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))
        : core.fetch(url, init)) as typeof fetch);
    expect(error).toBeInstanceOf(CoreUnavailableError);
    expect(seen).not.toHaveBeenCalled();
  });

  it('asks core without following a redirect, in at most ten seconds', async () => {
    const { core, options } = world();
    const seenInit: RequestInit[] = [];
    await verifyLogoutToken(await core.logoutToken({ sub: 'u1' }), {
      ...options,
      fetch: ((url: string, init?: RequestInit) => {
        seenInit.push(init ?? {});
        return core.fetch(url, init);
      }) as typeof fetch,
    });
    expect(seenInit.length).toBeGreaterThanOrEqual(2);
    for (const init of seenInit) {
      expect(init.redirect).toBe('error');
      // A signal that ends the call after ten seconds, and has not yet.
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal?.aborted).toBe(false);
    }
  });
});

describe('InvalidNoticeError', () => {
  it('is one of the SDK’s errors, and says nothing of which rule failed', () => {
    const error = new InvalidNoticeError();
    expect(error).toBeInstanceOf(SovereignError);
    expect(error.name).toBe('InvalidNoticeError');
    expect(error.message).toBe('This is not a notice core sent to this app.');
  });
});

describe('memorySeen', () => {
  it('remembers a jti until it expires, and says so for one it was given before', async () => {
    let now = 1_000;
    const seen = memorySeen(() => now);
    expect(await seen('a', 5_000)).toBe(false);
    expect(await seen('a', 5_000)).toBe(true);
    expect(await seen('b', 5_000)).toBe(false);
    now = 6_000;
    expect(await seen('a', 9_000)).toBe(false);
  });
});
