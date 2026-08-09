import { beforeAll, describe, expect, it } from 'vitest';

/**
 * RFC 0072 addendum, epic task 1.24. Runs real migrations against `:memory:`
 * SQLite and inserts through the real `authRun`/`authGet` helpers — not
 * mocked — because the row shape (JSON-encoded array columns, `ON DELETE
 * CASCADE userId`, boolean-as-0/1 on SQLite) was itself only discovered by
 * inspecting a client `@better-auth/oauth-provider`'s own `adminCreateOAuthClient`
 * created, and a mock would have hidden the very mismatches that mattered.
 */
beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret';
  process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
  process.env.AUTH_DATABASE_URL = ':memory:';
  // getEnv() memoizes on first call — must be set before anything in this
  // file triggers it (runAuthMigrations, in the first test below), or a
  // later assignment is silently ignored for the rest of the file.
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';
});

describe('seedBuiltinOAuthClient', () => {
  it('creates a resolvable client and is idempotent across calls', async () => {
    const { runAuthMigrations } = await import('../migrate');
    await runAuthMigrations();

    const { seedBuiltinOAuthClient, BUILTIN_OAUTH_CLIENTS } =
      await import('../builtin-oauth-clients');
    const first = await seedBuiltinOAuthClient(BUILTIN_OAUTH_CLIENTS.desktop);
    const second = await seedBuiltinOAuthClient(BUILTIN_OAUTH_CLIENTS.desktop);
    expect(second).toBe(first);

    const { authAll } = await import('../db');
    const rows = await authAll<{ name: string }>('SELECT * FROM "oauthClient" WHERE "name" = ?', [
      BUILTIN_OAUTH_CLIENTS.desktop.name,
    ]);
    // Idempotent means one row, not a duplicate on the second call.
    expect(rows).toHaveLength(1);
  });

  it('seeds a public, PKCE-required, secretless native client with no owning user', async () => {
    const { authGet } = await import('../db');
    const row = await authGet<Record<string, unknown>>(
      'SELECT * FROM "oauthClient" WHERE "name" = ?',
      ['sovereign-desktop (built-in)'],
    );
    expect(row).toBeDefined();
    expect(row?.clientSecret).toBeNull();
    expect(row?.tokenEndpointAuthMethod).toBe('none');
    expect(row?.type).toBe('native');
    expect(row?.public).toBe(1);
    expect(row?.requirePKCE).toBe(1);
    expect(row?.disabled).toBe(0);
    // Not tied to whichever admin happened to exist at seed time — see the
    // ON DELETE CASCADE comment in builtin-oauth-clients.ts.
    expect(row?.userId).toBeNull();
    expect(JSON.parse(row?.redirectUris as string)).toEqual(['sovereign://oauth/callback']);
  });

  it('resolves through the real getClient() lookup better-auth uses at authorize time', async () => {
    const { getAuth } = await import('../auth');
    const { seedBuiltinOAuthClient, BUILTIN_OAUTH_CLIENTS } =
      await import('../builtin-oauth-clients');
    const clientId = await seedBuiltinOAuthClient(BUILTIN_OAUTH_CLIENTS.desktop);

    const auth = getAuth();
    await auth.api.signUpEmail({
      body: {
        email: 'verify-oauth@example.com',
        password: 'correct-horse-battery-staple',
        name: 'Test User',
      },
    });
    const signInRes = await auth.api.signInEmail({
      body: { email: 'verify-oauth@example.com', password: 'correct-horse-battery-staple' },
      asResponse: true,
    });
    const cookie = signInRes.headers.get('set-cookie')?.split(';')[0];
    const headers = new Headers();
    if (cookie) headers.set('cookie', cookie);

    // getAuthOptions() returns the general BetterAuthOptions type, so TS can't
    // narrow auth.api to include oauth-provider's plugin-specific endpoints
    // (getOAuthClientPublic exists and works at runtime, verified above and
    // in builtin-oauth-clients.test.ts itself — this is a compile-time
    // inference gap, not a runtime one).
    type OAuthClientPublicApi = {
      getOAuthClientPublic: (args: {
        query: { client_id: string };
        headers: Headers;
      }) => Promise<{ client_id: string; client_name?: string }>;
    };
    const client = await (auth.api as unknown as OAuthClientPublicApi).getOAuthClientPublic({
      query: { client_id: clientId },
      headers,
    });
    expect(client.client_id).toBe(clientId);
    expect(client.client_name).toBe('sovereign-desktop (built-in)');
  });
});

describe('seedBuiltinOAuthClients', () => {
  it('seeds both shells and returns both client_ids', async () => {
    const { seedBuiltinOAuthClients } = await import('../builtin-oauth-clients');
    const result = await seedBuiltinOAuthClients();
    expect(typeof result.desktop).toBe('string');
    expect(typeof result.mobile).toBe('string');
    expect(result.desktop).not.toBe(result.mobile);
  });
});
