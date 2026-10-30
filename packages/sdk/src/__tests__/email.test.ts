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
  const tries = () => core.seen.requests.filter((r) => r.path === '/api/v1/email').length;
  return { core, sv, tries, time };
}

describe('email to a person (sdk §8, core-app §4.2)', () => {
  it('is sent by the app for itself, naming the person by sub, and answered with an id only', async () => {
    const { core, sv } = setup();
    const sent = await sv.app.email.sendToUser({
      to: 'ada',
      subject: 'Your task is due',
      body: 'Water the plants.',
      link: 'https://reminders.example/task/1',
    });
    expect(Object.keys(sent)).toEqual(['id']);
    expect(core.seen.appTokens).toBe(1);
    expect(core.seen.refreshes).toBe(0);
    expect(core.emailsSent).toMatchObject([
      { to: 'ada', subject: 'Your task is due', link: 'https://reminders.example/task/1' },
    ]);
  });

  it('is accepted, and dropped, for a person core does not have: the answer says nothing of them', async () => {
    const { core, sv } = setup();
    const here = await sv.app.email.sendToUser({ to: 'ada', subject: 's', body: 'b' });
    const gone = await sv.app.email.sendToUser({ to: 'nobody', subject: 's', body: 'b' });
    expect(Object.keys(gone)).toEqual(Object.keys(here));
    expect(core.emailsSent).toHaveLength(1);
  });

  it('with the same key within a day is the same send', async () => {
    const { core, sv, time } = setup();
    const first = await sv.app.email.sendToUser({ to: 'ada', subject: 's', body: 'b', key: 'k1' });
    const again = await sv.app.email.sendToUser({ to: 'ada', subject: 's', body: 'b', key: 'k1' });
    expect(again).toEqual(first);
    expect(core.emailsSent).toHaveLength(1);
    time.advance(25 * 60 * 60 * 1000);
    await sv.app.email.sendToUser({ to: 'ada', subject: 's', body: 'b', key: 'k1' });
    expect(core.emailsSent).toHaveLength(2);
  });

  it('raises NotSupportedError, with no request, on a core without mail', async () => {
    const { sv, core } = setup({
      api: { versions: ['v1'], capabilities: ['directory', 'notifications'] },
    });
    const error = (await sv.app.email
      .sendToUser({ to: 'ada', subject: 's', body: 'b' })
      .catch((e: unknown) => e)) as NotSupportedError;
    expect(error).toBeInstanceOf(NotSupportedError);
    expect(error.capability).toBe('email');
    expect(core.seen.requests.map((r) => r.path)).toEqual(['/.well-known/sovereign-instance']);
  });

  it('is not sent again when core fails, since a send is not safe to repeat', async () => {
    const { sv, core, tries } = setup();
    core.fail({ kind: 'status', status: 503 }, { target: 'api' });
    await expect(
      sv.app.email.sendToUser({ to: 'ada', subject: 's', body: 'b' }),
    ).rejects.toMatchObject({ name: 'CoreUnavailableError' });
    expect(tries()).toBe(1);
  });

  it('cannot be sent by an app whose core gives it no token of its own', async () => {
    const { sv } = setup({ appTokens: false });
    const error = await sv.app.email
      .sendToUser({ to: 'ada', subject: 's', body: 'b' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoreApiError);
    expect(error).toMatchObject({ code: 'unsupported_grant_type' });
  });
});
