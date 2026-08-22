import { beforeEach, describe, expect, it } from 'vitest';
import { events } from '../events';
import { provideHost } from '../host';
import type { PublishEventInput } from '../types';

/**
 * Proves that `sdk.events.publish()` resolves the calling plugin's ID
 * exclusively from an explicit `Headers` argument — never `next/headers()`
 * — mirroring `mailer-email-plugin-id.test.ts`'s focus on header resolution
 * for surfaces that must also work from a non-request context (a job
 * handler's synthetic `ctx.headers`, for instance).
 */
describe('sdk.events.publish — header resolution', () => {
  let seenPluginId: string | undefined;
  let seenInput: PublishEventInput | undefined;

  beforeEach(() => {
    seenPluginId = undefined;
    seenInput = undefined;

    provideHost({
      db: {
        async getClient() {
          return {};
        },
      },
      mailer: {
        async send() {
          /* no-op */
        },
      },
      email: {
        async sendToUser() {
          return { status: 'sent' };
        },
      },
      platform: {
        async getConfig() {
          return {} as never;
        },
      },
      directory: {
        async searchUsers() {
          return [];
        },
        async resolveUsers() {
          return [];
        },
      },
      data: {
        provide() {
          /* no-op */
        },
        async query() {
          return [];
        },
      },
      activity: {
        async log() {
          /* no-op */
        },
      },
      portability: {
        provideExport() {
          /* no-op */
        },
        provideImport() {
          /* no-op */
        },
        provideDelete() {
          /* no-op */
        },
      },
      authz: {
        provide() {
          /* no-op */
        },
        async hasGrant() {
          return false;
        },
      },
      plugins: {
        async get() {
          return null;
        },
        async list() {
          return [];
        },
        async getConsentStatus() {
          return 'not_granted';
        },
      },
      notifications: {
        async send() {},
        async list() {
          return { items: [], unreadCount: 0 };
        },
        async markRead() {},
        async markAllRead() {},
        async dismiss() {},
        async dismissAll() {},
      },
      webhooks: {
        async verifyHmac() {
          return false;
        },
        async checkReplay() {
          return true;
        },
      },
      handoffs: {
        async create() {
          return { token: 'token', expiresAt: 0 };
        },
        async consume() {
          return {} as never;
        },
      },
      jobs: {
        async enqueue() {
          return {} as never;
        },
        async schedule() {
          return {} as never;
        },
        async cancel() {
          return false;
        },
        async get() {
          return null;
        },
      },
      events: {
        async publish(input, pluginId) {
          seenInput = input;
          seenPluginId = pluginId;
        },
      },
      tools: {
        provide() {
          /* no-op */
        },
        async preview() {
          return { summary: '' };
        },
        async execute() {
          return null;
        },
      },
      crypto: {
        async encryptField(value: string) {
          return `svf0:${Buffer.from(value, 'utf8').toString('base64url')}`;
        },
        async decryptField(envelope: string) {
          return Buffer.from(envelope.slice('svf0:'.length), 'base64url').toString('utf8');
        },
        async hashField(value: string) {
          return `h:${value}`;
        },
        async hashFieldCandidates(value: string) {
          return [`h:${value}`];
        },
        async registerTables() {
          /* no-op */
        },
      },
      storage: {
        async put() {
          return {} as never;
        },
        async get() {
          return null;
        },
        async delete() {
          /* no-op */
        },
        async list() {
          return [];
        },
        async getSignedUrl() {
          return 'https://example.test/signed';
        },
      },
      secrets: {
        async create() {
          return {} as never;
        },
        async get() {
          return null;
        },
        async list() {
          return [];
        },
        async update() {
          return {} as never;
        },
        async delete() {
          /* no-op */
        },
      },
      connections: {
        async create() {
          return {} as never;
        },
        async list() {
          return [];
        },
        async get() {
          return null;
        },
        async update() {
          return {} as never;
        },
        async disconnect() {
          /* no-op */
        },
        async markUsed() {
          /* no-op */
        },
        async markError() {
          return {} as never;
        },
        async createOAuthState() {
          return 'state';
        },
        async verifyOAuthState() {
          return {} as never;
        },
        async getProviderConfig() {
          return {} as never;
        },
      },
      e2ee: {
        async getProfile() {
          return null;
        },
        async createProfile() {
          return {} as never;
        },
        async getRecoveryWrapper() {
          return null;
        },
        async setRecoveryWrapper() {
          return {} as never;
        },
        async enrollDevice() {
          return {} as never;
        },
        async listDevices() {
          return [];
        },
        async revokeDevice() {
          /* no-op */
        },
      },
    });
  });

  it('resolves pluginId from the x-sovereign-plugin-id header', async () => {
    const headers = new Headers({ 'x-sovereign-plugin-id': 'com.example.notes' });
    await events.publish(
      { channel: 'list:1', type: 'item.checked', payload: { itemId: 'x' } },
      headers,
    );
    expect(seenPluginId).toBe('com.example.notes');
    expect(seenInput).toEqual({
      channel: 'list:1',
      type: 'item.checked',
      payload: { itemId: 'x' },
    });
  });

  it('defaults pluginId to "unknown" with no headers argument', async () => {
    await events.publish({ channel: 'list:1', type: 'item.checked' });
    expect(seenPluginId).toBe('unknown');
  });

  it('defaults pluginId to "unknown" when headers has no plugin id set', async () => {
    await events.publish({ channel: 'list:1', type: 'item.checked' }, new Headers());
    expect(seenPluginId).toBe('unknown');
  });

  it('accepts a job handler-style synthetic Headers object, same as ctx.headers would provide', async () => {
    const syntheticHeaders = new Headers({ 'x-sovereign-plugin-id': 'com.example.notes' });
    await events.publish({ channel: 'followup:task', type: 'created' }, syntheticHeaders);
    expect(seenPluginId).toBe('com.example.notes');
  });
});
