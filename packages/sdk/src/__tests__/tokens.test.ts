import { describe, expect, it } from 'vitest';
import { SessionEndedError, createSovereign } from '../index';
import { TokenManager } from '../tokens';
import { Transport } from '../transport';
import { createFakeCore } from '../testing';
import { checkedAgainstContract, clock, memoryStore, settingsFor } from './helpers';

/** A fake core, a clock both share, and a client wired to them, the way an app's tests would. */
function setup(
  options: { lock?: boolean; failWrites?: boolean; logger?: (event: unknown) => void } = {},
) {
  const time = clock();
  const core = createFakeCore({ now: time.environment.now });
  core.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
  const stored = memoryStore(options);
  stored.tokens.set('u1', core.signIn('u1'));
  const client = () =>
    createSovereign({
      ...settingsFor(core),
      tokenStore: stored.store,
      fetch: checkedAgainstContract(core.fetch),
      environment: time.environment,
      timeoutMs: 50,
      ...(options.logger ? { logger: options.logger } : {}),
    });
  return { time, core, stored, client };
}

const search = (sv: ReturnType<ReturnType<typeof setup>['client']>) =>
  sv.as({ sub: 'u1' }).directory.searchUsers({ q: 'ada' });

describe('a person’s tokens (sdk §5)', () => {
  it('searches the Directory as the person, and the fake’s answers match the contract', async () => {
    const { client } = setup();
    expect(await search(client())).toEqual({
      users: [{ sub: 'u1', name: 'Ada Lovelace', picture: null }],
    });
  });

  it('makes one refresh for twenty parallel calls with an expired access token', async () => {
    const { client, core } = setup();
    const sv = client();
    const answers = await Promise.all(Array.from({ length: 20 }, () => search(sv)));
    expect(answers).toHaveLength(20);
    expect(core.seen.refreshes).toBe(1);
    expect(core.seen.reused).toBe(0);
  });

  it('caches the access token, and asks again 30 seconds before it expires', async () => {
    const { client, core, time } = setup();
    const sv = client();
    await search(sv);
    await search(sv);
    expect(core.seen.refreshes).toBe(1);
    time.advance(900_000 - 31_000);
    await search(sv);
    expect(core.seen.refreshes).toBe(1);
    time.advance(2_000);
    await search(sv);
    expect(core.seen.refreshes).toBe(2);
  });

  it('stores the new refresh token before the access token is used', async () => {
    const { client, core, stored } = setup();
    const before = stored.tokens.get('u1');
    await search(client());
    expect(stored.writes).toHaveLength(1);
    expect(stored.writes[0]).toMatchObject({ sub: 'u1', previous: before });
    expect(stored.tokens.get('u1')).toBe(stored.writes[0]?.next);
    const order = core.seen.requests.map((request) => request.path);
    expect(order.indexOf('/api/auth/oauth2/token')).toBeLessThan(
      order.indexOf('/api/v1/directory/users'),
    );
  });

  it('refreshes once in each of two processes that share a store with a lock, and never sends a token twice', async () => {
    const { client, core, stored } = setup({ lock: true });
    const first = client();
    const second = client();
    await Promise.all([
      ...Array.from({ length: 10 }, () => search(first)),
      ...Array.from({ length: 10 }, () => search(second)),
    ]);
    expect(core.seen.refreshes).toBe(2);
    expect(core.seen.reused).toBe(0);
    expect(stored.writes).toHaveLength(2);
  });

  it('uses the token another process stored, which it finds when it reads', async () => {
    const { client, core, stored } = setup({ lock: true });
    await search(client());
    const rotated = stored.tokens.get('u1');
    // A second process starts later, with an empty cache, and finds the rotated token stored.
    await search(client());
    expect(core.seen.reused).toBe(0);
    expect(stored.writes[1]?.previous).toBe(rotated);
  });

  it('raises SessionEndedError when the answer to a refresh is lost, and never sends the old token again', async () => {
    const { client, core, stored } = setup();
    const sv = client();
    core.fail({ kind: 'lost-answer' }, { target: 'token', times: 1 });
    await expect(search(sv)).rejects.toBeInstanceOf(SessionEndedError);
    // Core rotated the token and the app never heard: its stored token is dead.
    expect(core.seen.refreshes).toBe(1);
    expect(stored.writes).toHaveLength(0);
    // Asking again must not send the dead token, which core would take for theft.
    await expect(search(sv)).rejects.toBeInstanceOf(SessionEndedError);
    expect(core.seen.refreshes).toBe(1);
    expect(core.seen.reused).toBe(0);
    expect(
      core.seen.requests.filter((request) => request.path === '/api/auth/oauth2/token'),
    ).toHaveLength(1);
  }, 10_000);

  it('goes on once the person has signed in again', async () => {
    const { client, core, stored } = setup();
    const sv = client();
    core.fail({ kind: 'lost-answer' }, { target: 'token', times: 1 });
    await expect(search(sv)).rejects.toBeInstanceOf(SessionEndedError);
    stored.tokens.set('u1', core.signIn('u1'));
    expect((await search(sv)).users).toHaveLength(1);
  }, 10_000);

  it('raises SessionEndedError when core has rotated and the new token cannot be stored', async () => {
    const { client, stored } = setup({ failWrites: true });
    await expect(search(client())).rejects.toBeInstanceOf(SessionEndedError);
    expect(stored.writes).toHaveLength(1);
  });

  it('keeps the token and says core is unavailable when core is not reached at all', async () => {
    const { client, core, stored } = setup();
    const before = stored.tokens.get('u1');
    core.fail({ kind: 'down' });
    await expect(search(client())).rejects.toMatchObject({ name: 'CoreUnavailableError' });
    core.heal();
    expect(stored.tokens.get('u1')).toBe(before);
    expect((await search(client())).users).toHaveLength(1);
    expect(core.seen.reused).toBe(0);
  });

  it('keeps the token when core answers a refresh with a 5xx, and does not send it again in that call', async () => {
    const { client, core, stored } = setup();
    const before = stored.tokens.get('u1');
    core.fail({ kind: 'status', status: 503 }, { target: 'token' });
    await expect(search(client())).rejects.toMatchObject({ name: 'CoreUnavailableError' });
    expect(
      core.seen.requests.filter((request) => request.path === '/api/auth/oauth2/token'),
    ).toHaveLength(1);
    expect(stored.tokens.get('u1')).toBe(before);
  });

  it('ends the session when core says the token is not valid, and when there is none', async () => {
    const { client, core, stored } = setup();
    core.revoke('u1');
    await expect(search(client())).rejects.toBeInstanceOf(SessionEndedError);
    stored.tokens.delete('u1');
    await expect(search(client())).rejects.toBeInstanceOf(SessionEndedError);
  });

  it('discards a token core refuses and tries once more with a new one', async () => {
    const { client, core } = setup();
    const sv = client();
    await search(sv);
    core.expireAccessTokens();
    expect((await search(sv)).users).toHaveLength(1);
    expect(core.seen.refreshes).toBe(2);
    expect(core.seen.requests.filter((request) => request.status === 401)).toHaveLength(1);
  });

  it('raises SessionEndedError when a second 401 follows the retry', async () => {
    const { client, core } = setup();
    core.fail({ kind: 'status', status: 401 }, { target: 'api' });
    await expect(search(client())).rejects.toBeInstanceOf(SessionEndedError);
    expect(
      core.seen.requests.filter((request) => request.path === '/api/v1/directory/users'),
    ).toHaveLength(2);
  });

  it('does not retry a 403, which means a scope is missing', async () => {
    const { client, core } = setup();
    core.fail({ kind: 'status', status: 403 }, { target: 'api' });
    await expect(search(client())).rejects.toMatchObject({ name: 'CoreApiError', status: 403 });
    expect(
      core.seen.requests.filter((request) => request.path === '/api/v1/directory/users'),
    ).toHaveLength(1);
    expect(core.seen.refreshes).toBe(1);
  });

  it('never logs a token, a secret or a person’s details', async () => {
    const events: unknown[] = [];
    const { client, core, stored } = setup({ logger: (event) => events.push(event) });
    const refresh = stored.tokens.get('u1') as string;
    await search(client());
    const text = JSON.stringify(events);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(Object.keys(event as object).sort()).toEqual(['durationMs', 'operation', 'status']);
    }
    for (const secret of [refresh, core.credentials.clientSecret, 'Ada', 'u1'])
      expect(text).not.toContain(secret);
  });
});

describe('the app’s own token (sdk §5.2)', () => {
  const manager = (options: { appTokens?: boolean } = {}) => {
    const time = clock();
    const core = createFakeCore({ now: time.environment.now, ...options });
    const transport = new Transport({ fetch: core.fetch, environment: time.environment });
    const tokens = new TokenManager({
      transport,
      coreUrl: core.url,
      clientId: core.credentials.clientId,
      clientSecret: core.credentials.clientSecret,
      store: undefined,
    });
    return { core, time, tokens, transport };
  };

  it('is asked for with client_credentials, cached in memory, and asked for again when discarded', async () => {
    const { core, tokens, transport } = manager();
    const first = await tokens.token({ kind: 'app' }, transport.deadline());
    expect(await tokens.token({ kind: 'app' }, transport.deadline())).toBe(first);
    expect(core.seen.appTokens).toBe(1);
    tokens.discard({ kind: 'app' });
    expect(await tokens.token({ kind: 'app' }, transport.deadline())).not.toBe(first);
    expect(core.seen.appTokens).toBe(2);
  });

  it('is requested once for twenty parallel calls', async () => {
    const { core, tokens, transport } = manager();
    await Promise.all(
      Array.from({ length: 20 }, () => tokens.token({ kind: 'app' }, transport.deadline())),
    );
    expect(core.seen.appTokens).toBe(1);
  });

  it('is a CoreApiError when core does not give app tokens, and holds nothing of a person', async () => {
    const { tokens, transport } = manager({ appTokens: false });
    await expect(tokens.token({ kind: 'app' }, transport.deadline())).rejects.toMatchObject({
      name: 'CoreApiError',
      code: 'unsupported_grant_type',
    });
    await expect(
      tokens.token({ kind: 'person', sub: 'u1' }, transport.deadline()),
    ).rejects.toBeInstanceOf(SessionEndedError);
  });

  it('is an actor with no capability of its own yet, and not the person’s', () => {
    const time = clock();
    const core = createFakeCore({ now: time.environment.now });
    const sv = createSovereign({
      ...settingsFor(core),
      fetch: core.fetch,
      environment: time.environment,
    });
    expect(Object.keys(sv.app)).toEqual(['notifications']);
    expect((sv.app as { directory?: unknown }).directory).toBeUndefined();
  });
});
