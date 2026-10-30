import { describe, expect, it, vi } from 'vitest';
import { CoreApiError, NotSupportedError, createSovereign } from '../index';
import { createFakeCore, type FakeCoreOptions } from '../testing';
import { checkedAgainstContract, clock, memoryStore, settingsFor } from './helpers';

function setup(options: FakeCoreOptions = {}) {
  const time = clock();
  const core = createFakeCore({ now: time.environment.now, ...options });
  core.addPerson({ sub: 'ada', name: 'Ada Lovelace' });
  const stored = memoryStore();
  stored.tokens.set('ada', core.signIn('ada'));
  const fetch = vi.fn(checkedAgainstContract(core.fetch));
  const sv = createSovereign({
    ...settingsFor(core),
    tokenStore: stored.store,
    fetch: fetch as unknown as typeof globalThis.fetch,
    environment: time.environment,
    timeoutMs: 50,
  });
  const tries = () => core.seen.requests.filter((r) => r.path === '/api/v1/notifications').length;
  return { core, sv, tries };
}

describe('notifications (sdk §8, core-app §4.1)', () => {
  it('are sent by the app for itself, with a token of its own, and answered with an id', async () => {
    const { core, sv } = setup();
    const sent = await sv.app.notifications.send({
      to: 'ada',
      title: 'Due today',
      body: 'Water the plants',
    });
    expect(Object.keys(sent)).toEqual(['id']);
    expect(core.seen.appTokens).toBe(1);
    expect(core.seen.refreshes).toBe(0);
    expect(core.notificationsSent).toMatchObject([{ to: 'ada', title: 'Due today' }]);
  });

  it('are accepted, and dropped, when the person is not one core has: the answer says nothing of them', async () => {
    const { core, sv } = setup();
    const here = await sv.app.notifications.send({ to: 'ada', title: 'x' });
    const gone = await sv.app.notifications.send({ to: 'nobody', title: 'x' });
    expect(Object.keys(gone)).toEqual(Object.keys(here));
    expect(core.notificationsSent).toHaveLength(1);
  });

  it('are listed, read and dismissed by the person, through the app, and only the app’s own', async () => {
    const { sv } = setup();
    await sv.app.notifications.send({ to: 'ada', title: 'first' });
    await sv.app.notifications.send({ to: 'ada', title: 'second', category: 'warning' });
    const mine = sv.as({ sub: 'ada' }).notifications;
    const { notifications } = await mine.list();
    expect(notifications.map((n) => n.title).sort()).toEqual(['first', 'second']);
    const first = notifications.find((n) => n.title === 'first');
    expect((await mine.markRead(first?.id as string)).readAt).not.toBeNull();
    expect((await mine.list({ unread: true })).notifications.map((n) => n.title)).toEqual([
      'second',
    ]);
    expect((await mine.list({ limit: 1 })).notifications).toHaveLength(1);
    expect(await mine.markAllRead()).toEqual({ count: 1 });
    await mine.dismiss(first?.id as string);
    expect((await mine.list()).notifications.map((n) => n.title)).toEqual(['second']);
    expect(await mine.dismissAll()).toEqual({ count: 1 });
    expect((await mine.list()).notifications).toEqual([]);
  });

  it('raise CoreApiError 404 for one that is not the person’s', async () => {
    const { sv } = setup();
    await expect(sv.as({ sub: 'ada' }).notifications.markRead('nope')).rejects.toMatchObject({
      name: 'CoreApiError',
      status: 404,
    });
  });

  it('raise NotSupportedError, with no request, on a core that does not serve them', async () => {
    const { sv, core } = setup({ api: { versions: ['v1'], capabilities: ['directory'] } });
    await expect(sv.app.notifications.send({ to: 'ada', title: 'x' })).rejects.toBeInstanceOf(
      NotSupportedError,
    );
    await expect(sv.as({ sub: 'ada' }).notifications.list()).rejects.toMatchObject({
      capability: 'notifications',
    });
    // The instance document is read once and believed for five minutes; nothing else was sent.
    expect(core.seen.requests.map((r) => r.path)).toEqual(['/.well-known/sovereign-instance']);
  });

  it('are not sent again when core fails, since a send is not safe to repeat', async () => {
    const { sv, core, tries } = setup();
    core.fail({ kind: 'status', status: 503 }, { target: 'api' });
    await expect(sv.app.notifications.send({ to: 'ada', title: 'x' })).rejects.toMatchObject({
      name: 'CoreUnavailableError',
    });
    expect(tries()).toBe(1);
  });

  it('cannot be sent by an app whose core gives it no token of its own', async () => {
    const { sv } = setup({ appTokens: false });
    const error = await sv.app.notifications
      .send({ to: 'ada', title: 'x' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoreApiError);
    expect(error).toMatchObject({ code: 'unsupported_grant_type' });
  });
});
