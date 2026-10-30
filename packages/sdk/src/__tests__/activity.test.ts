import { describe, expect, it, vi } from 'vitest';
import { CoreApiError, NotSupportedError, createSovereign } from '../index';
import { createFakeCore, type FakeCoreOptions } from '../testing';
import { checkedAgainstContract, clock, memoryStore, settingsFor } from './helpers';

function setup(options: FakeCoreOptions = {}) {
  const time = clock();
  const core = createFakeCore({ now: time.environment.now, ...options });
  core.addPerson({ sub: 'ada', name: 'Ada Lovelace' });
  const fetch = vi.fn(checkedAgainstContract(core.fetch));
  const sv = createSovereign({
    ...settingsFor(core),
    tokenStore: memoryStore().store,
    fetch: fetch as unknown as typeof globalThis.fetch,
    environment: time.environment,
    timeoutMs: 50,
  });
  const tries = () => core.seen.requests.filter((r) => r.path === '/api/v1/activity').length;
  return { core, sv, tries, time };
}

describe('activity (sdk §8, core-app §4.3)', () => {
  it('is recorded by the app for itself, naming the person by sub, and answered with an id only', async () => {
    const { core, sv } = setup();
    const recorded = await sv.app.activity.log({
      to: 'ada',
      summary: 'You completed Water the plants',
      link: 'https://reminders.example/task/1',
    });
    expect(Object.keys(recorded)).toEqual(['id']);
    expect(core.seen.appTokens).toBe(1);
    expect(core.seen.refreshes).toBe(0);
    expect(core.activityRecorded).toMatchObject([
      {
        to: 'ada',
        summary: 'You completed Water the plants',
        link: 'https://reminders.example/task/1',
      },
    ]);
  });

  it('is accepted, and dropped, for a person core does not have: the answer says nothing of them', async () => {
    const { core, sv } = setup();
    const here = await sv.app.activity.log({ to: 'ada', summary: 'x' });
    const gone = await sv.app.activity.log({ to: 'nobody', summary: 'x' });
    expect(Object.keys(gone)).toEqual(Object.keys(here));
    expect(core.activityRecorded).toHaveLength(1);
  });

  it('with the same key within a day is the same record', async () => {
    const { core, sv, time } = setup();
    const first = await sv.app.activity.log({ to: 'ada', summary: 'x', key: 'k1' });
    expect(await sv.app.activity.log({ to: 'ada', summary: 'x', key: 'k1' })).toEqual(first);
    expect(core.activityRecorded).toHaveLength(1);
    time.advance(25 * 60 * 60 * 1000);
    await sv.app.activity.log({ to: 'ada', summary: 'x', key: 'k1' });
    expect(core.activityRecorded).toHaveLength(2);
  });

  it('has no call to read it back, as the app or as a person', () => {
    const { sv } = setup();
    expect(Object.keys(sv.app.activity)).toEqual(['log']);
    expect((sv.as({ sub: 'ada' }) as unknown as Record<string, unknown>).activity).toBeUndefined();
  });

  it('raises NotSupportedError, with no request, on a core that does not serve it', async () => {
    const { sv, core } = setup({ api: { versions: ['v1'], capabilities: ['directory'] } });
    const error = (await sv.app.activity
      .log({ to: 'ada', summary: 'x' })
      .catch((e: unknown) => e)) as NotSupportedError;
    expect(error).toBeInstanceOf(NotSupportedError);
    expect(error.capability).toBe('activity');
    expect(core.seen.requests.map((r) => r.path)).toEqual(['/.well-known/sovereign-instance']);
  });

  it('is not sent again when core fails, since a record is not safe to repeat', async () => {
    const { sv, core, tries } = setup();
    core.fail({ kind: 'status', status: 503 }, { target: 'api' });
    await expect(sv.app.activity.log({ to: 'ada', summary: 'x' })).rejects.toMatchObject({
      name: 'CoreUnavailableError',
    });
    expect(tries()).toBe(1);
  });

  it('cannot be recorded by an app whose core gives it no token of its own', async () => {
    const { sv } = setup({ appTokens: false });
    const error = await sv.app.activity.log({ to: 'ada', summary: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoreApiError);
    expect(error).toMatchObject({ code: 'unsupported_grant_type' });
  });
});
