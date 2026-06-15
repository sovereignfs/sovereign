import { getPlatformDb } from '@sovereignfs/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { ConsentRequiredError, NotImplementedError, NotAuthenticatedError, sdk } from './index';

beforeAll(() => {
  // sdk.platform.getConfig() opens the platform DB from the environment;
  // point it at an in-memory database for tests.
  process.env.DATABASE_URL = ':memory:';
});

describe('sdk', () => {
  it('exposes the full v1 surface', () => {
    expect(typeof sdk.auth.getSession).toBe('function');
    expect(typeof sdk.auth.requireSession).toBe('function');
    expect(typeof sdk.auth.changePassword).toBe('function');
    expect(typeof sdk.auth.listSessions).toBe('function');
    expect(typeof sdk.auth.revokeSession).toBe('function');
    expect(typeof sdk.db.getClient).toBe('function');
    expect(typeof sdk.mailer.send).toBe('function');
    expect(typeof sdk.platform.getConfig).toBe('function');
    expect(typeof sdk.storage.put).toBe('function');
    expect(typeof sdk.storage.get).toBe('function');
    expect(typeof sdk.notifications.send).toBe('function');
    expect(typeof sdk.events.publish).toBe('function');
    expect(typeof sdk.events.subscribe).toBe('function');
    expect(typeof sdk.data.query).toBe('function');
    expect(typeof sdk.data.provide).toBe('function');
    expect(typeof sdk.activity.log).toBe('function');
  });

  it('db.getClient returns the live platform Drizzle instance', async () => {
    const client = (await sdk.db.getClient()) as Record<string, unknown>;
    // A real Drizzle instance exposes the query-builder methods plugins use.
    expect(typeof client.select).toBe('function');
    expect(typeof client.insert).toBe('function');
    // It is the platform DB's client, not a fresh connection per call.
    expect(client).toBe((await getPlatformDb()).db);
  });

  it('platform.getConfig returns tenant name, invite flag, and platform version', async () => {
    const config = await sdk.platform.getConfig();
    expect(config.tenantName).toBe('Sovereign');
    expect(config.inviteOnly).toBe(false);
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('post-v1 surfaces throw NotImplementedError with a clear v1 message', () => {
    expect(() => sdk.storage.put('k', Buffer.from('x'))).toThrow(/not implemented in Sovereign v1/);
    expect(() => sdk.notifications.send('u', 'hi')).toThrow(NotImplementedError);
    expect(() => sdk.events.subscribe('e', () => undefined)).toThrow(NotImplementedError);
  });

  it('reserved cross-plugin data surface (RFC 0002) throws NotImplementedError', () => {
    expect(() => sdk.data.query({ providerId: 'p', contract: 'c', version: 1 })).toThrow(
      NotImplementedError,
    );
    expect(() => sdk.data.provide('c', async () => [])).toThrow(NotImplementedError);
  });

  it('reserved activity-log surface (RFC 0005) throws NotImplementedError', () => {
    expect(() => sdk.activity.log({ action: 'list.created' })).toThrow(NotImplementedError);
  });

  it('exports NotAuthenticatedError and ConsentRequiredError', () => {
    const err = new NotAuthenticatedError();
    expect(err.name).toBe('NotAuthenticatedError');
    expect(err).toBeInstanceOf(Error);

    const consent = new ConsentRequiredError();
    expect(consent.name).toBe('ConsentRequiredError');
    expect(consent).toBeInstanceOf(Error);
  });
});
