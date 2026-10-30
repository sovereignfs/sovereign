import { describe, expect, it, vi } from 'vitest';
import { CoreApiError, CoreUnavailableError, createSovereign } from '../index';
import { createFakeCore } from '../testing';
import { checkedAgainstContract, clock, memoryStore, settingsFor } from './helpers';

function setup(options: { timeoutMs?: number } = {}) {
  const time = clock();
  const core = createFakeCore({ now: time.environment.now });
  core.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
  const stored = memoryStore();
  stored.tokens.set('u1', core.signIn('u1'));
  const fetch = vi.fn(checkedAgainstContract(core.fetch));
  const sv = createSovereign({
    ...settingsFor(core),
    tokenStore: stored.store,
    fetch: fetch as unknown as typeof globalThis.fetch,
    environment: time.environment,
    timeoutMs: options.timeoutMs ?? 50,
  });
  return { sv, core, time, fetch, stored };
}

const attempts = (core: ReturnType<typeof createFakeCore>, path: string) =>
  core.seen.requests.filter((request) => request.path === path).length;

describe('failure (sdk §6)', () => {
  it('lets an app start while core is down: creating the client sends nothing', () => {
    const { fetch, core } = setup();
    core.fail({ kind: 'down' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('raises CoreUnavailableError for each kind of call when core is down, inside the limit', async () => {
    const { sv, core, time } = setup();
    core.fail({ kind: 'down' });
    const started = time.state.time;
    await expect(sv.instance.getBranding()).rejects.toBeInstanceOf(CoreUnavailableError);
    await expect(sv.as({ sub: 'u1' }).directory.searchUsers({ q: 'ada' })).rejects.toBeInstanceOf(
      CoreUnavailableError,
    );
    await expect(
      sv.as({ sub: 'u1' }).directory.resolveUsers({ subs: ['u1'] }),
    ).rejects.toBeInstanceOf(CoreUnavailableError);
    // Each call's retries and pauses fit in ten seconds.
    expect(time.state.time - started).toBeLessThan(3 * 10_000);
  });

  it('retries a read at most twice when core is refusing connections', async () => {
    const { sv, core } = setup();
    core.fail({ kind: 'down' });
    await expect(sv.instance.getBranding()).rejects.toBeInstanceOf(CoreUnavailableError);
    expect(attempts(core, '/.well-known/sovereign-instance')).toBe(3);
  });

  it('retries a 5xx at most twice, with a jittered pause that doubles', async () => {
    const { sv, core, time } = setup();
    core.fail({ kind: 'status', status: 503 }, { target: 'instance' });
    await expect(sv.instance.getBranding()).rejects.toBeInstanceOf(CoreUnavailableError);
    expect(attempts(core, '/.well-known/sovereign-instance')).toBe(3);
    // 200ms * (0.5 + 0.5), then 400ms * (0.5 + 0.5).
    expect(time.state.slept).toEqual([200, 400]);
  });

  it('succeeds when a retry gets through', async () => {
    const { sv, core } = setup();
    core.fail({ kind: 'status', status: 502 }, { target: 'instance', times: 2 });
    expect((await sv.instance.getBranding()).name).toBe('Fake instance');
    expect(attempts(core, '/.well-known/sovereign-instance')).toBe(3);
  });

  it('retries a lookup the contract marks safe to repeat, and nothing it does not', async () => {
    const { sv, core } = setup();
    core.fail({ kind: 'status', status: 503 }, { target: 'api', times: 1 });
    const answer = await sv.as({ sub: 'u1' }).directory.resolveUsers({ subs: ['u1'] });
    expect(answer.users).toHaveLength(1);
    // The token request is a POST that is not safe to repeat: a 5xx there is raised and not sent again.
    const second = setup();
    second.core.fail({ kind: 'status', status: 503 }, { target: 'token' });
    await expect(
      second.sv.as({ sub: 'u1' }).directory.searchUsers({ q: 'a' }),
    ).rejects.toBeInstanceOf(CoreUnavailableError);
    expect(attempts(second.core, '/api/auth/oauth2/token')).toBe(1);
  });

  it('gives up on a timeout at the request’s limit, and raises CoreUnavailableError', async () => {
    const { sv, core } = setup({ timeoutMs: 20 });
    core.fail({ kind: 'timeout' }, { target: 'instance' });
    const started = Date.now();
    await expect(sv.instance.getBranding()).rejects.toBeInstanceOf(CoreUnavailableError);
    // Three tries of about 20ms each, with the clock a test moves, not a real wait for the backoff.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('retries a 429 once after Retry-After when that fits, and then answers', async () => {
    const { sv, core, time } = setup();
    core.fail({ kind: 'status', status: 429, retryAfter: 2 }, { target: 'instance', times: 1 });
    expect((await sv.instance.getBranding()).name).toBe('Fake instance');
    expect(time.state.slept).toEqual([2_000]);
    expect(attempts(core, '/.well-known/sovereign-instance')).toBe(2);
  });

  it('raises a 429 with retryAfter set when waiting would not fit the limit, or when it comes twice', async () => {
    const { sv, core } = setup();
    core.fail({ kind: 'status', status: 429, retryAfter: 60 }, { target: 'instance' });
    const error = await sv.instance.getBranding().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoreApiError);
    expect(error).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: 60 });
    expect(attempts(core, '/.well-known/sovereign-instance')).toBe(1);

    core.heal();
    core.fail({ kind: 'status', status: 429, retryAfter: 1 }, { target: 'instance' });
    await expect(sv.instance.getBranding()).rejects.toMatchObject({ status: 429, retryAfter: 1 });
    expect(attempts(core, '/.well-known/sovereign-instance')).toBe(3);
  });

  it('puts a timeout on every request it sends', async () => {
    const { sv, fetch } = setup();
    await sv.instance.getBranding();
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('puts no message of a failure beyond what happened: no address, no token', async () => {
    const { sv, core } = setup();
    core.fail({ kind: 'down' });
    const error = (await sv
      .as({ sub: 'u1' })
      .directory.searchUsers({ q: 'a' })
      .catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain('core.test');
    expect(error.message).not.toContain(core.credentials.clientSecret);
  });
});
