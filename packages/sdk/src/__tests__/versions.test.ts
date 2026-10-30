import { describe, expect, it } from 'vitest';
import { NotSupportedError, createSovereign } from '../index';
import { createFakeCore, type FakeCoreOptions } from '../testing';
import { checkedAgainstContract, clock, memoryStore, settingsFor } from './helpers';

function setup(core: FakeCoreOptions = {}) {
  const time = clock();
  const fake = createFakeCore({ now: time.environment.now, ...core });
  fake.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
  const stored = memoryStore();
  stored.tokens.set('u1', fake.signIn('u1'));
  const sv = createSovereign({
    ...settingsFor(fake),
    tokenStore: stored.store,
    fetch: checkedAgainstContract(fake.fetch),
    environment: time.environment,
    timeoutMs: 50,
  });
  const documents = () =>
    fake.seen.requests.filter((request) => request.path === '/.well-known/sovereign-instance')
      .length;
  const search = () => sv.as({ sub: 'u1' }).directory.searchUsers({ q: 'ada' });
  return { sv, fake, time, documents, search };
}

describe('version support (sdk §7)', () => {
  it('reads the instance document before the first call to a capability, and then caches it for five minutes', async () => {
    const { search, documents, time } = setup();
    await search();
    await search();
    expect(documents()).toBe(1);
    time.advance(4 * 60_000);
    await search();
    expect(documents()).toBe(1);
    time.advance(2 * 60_000);
    await search();
    expect(documents()).toBe(2);
  });

  it('raises NotSupportedError for a capability the instance lacks, naming it, and sends nothing', async () => {
    const { search, fake } = setup({ api: { versions: ['v1'], capabilities: [] } });
    const error = (await search().catch((e: unknown) => e)) as NotSupportedError;
    expect(error).toBeInstanceOf(NotSupportedError);
    expect(error.capability).toBe('directory');
    expect(error.message).toContain('directory');
    const paths = fake.seen.requests.map((request) => request.path);
    expect(paths).toEqual(['/.well-known/sovereign-instance']);
  });

  it('treats a core too old to publish api as serving the Directory and the instance document', async () => {
    const { search } = setup({ api: undefined });
    expect((await search()).users).toHaveLength(1);
  });

  it('refuses everything when the core serves no version this SDK speaks', async () => {
    const { search } = setup({ api: { versions: ['v2'], capabilities: ['directory'] } });
    await expect(search()).rejects.toBeInstanceOf(NotSupportedError);
  });

  it('makes the call anyway when the document cannot be read', async () => {
    const { search, fake } = setup();
    fake.fail({ kind: 'status', status: 503 }, { target: 'instance' });
    expect((await search()).users).toHaveLength(1);
  });

  it('reads the document again at once after a 404', async () => {
    const { search, documents, fake } = setup();
    await search();
    expect(documents()).toBe(1);
    fake.fail({ kind: 'status', status: 404 }, { target: 'api', times: 1 });
    await expect(search()).rejects.toMatchObject({ name: 'CoreApiError', status: 404 });
    await search();
    expect(documents()).toBe(2);
  });

  it('does not check the instance document itself, which is how it is read', async () => {
    const { sv, fake } = setup({ api: { versions: ['v1'], capabilities: [] } });
    expect((await sv.instance.getBranding()).api).toEqual({ versions: ['v1'], capabilities: [] });
    expect(fake.seen.requests).toHaveLength(1);
  });
});
