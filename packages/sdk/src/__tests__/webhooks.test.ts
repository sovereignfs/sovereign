import { beforeEach, describe, expect, it } from 'vitest';
import { provideHost } from '../host';
import { webhooks } from '../webhooks';
import type { CheckWebhookReplayInput, VerifyWebhookHmacInput } from '../types';

/**
 * Proves that `sdk.webhooks.*` resolves the calling plugin's ID exclusively
 * from the `x-sovereign-plugin-id` request header, and — unlike
 * notifications/events/jobs — **fails closed (returns `false`) rather than
 * falling back to `'unknown'`** when the header is missing, since a webhook
 * helper called with no real plugin context has no legitimate use.
 */
describe('sdk.webhooks — header resolution', () => {
  let seenPluginId: string | undefined;
  let seenHmacInput: VerifyWebhookHmacInput | undefined;
  let seenReplayInput: CheckWebhookReplayInput | undefined;
  let hmacResult = true;
  let replayResult = true;

  beforeEach(() => {
    seenPluginId = undefined;
    seenHmacInput = undefined;
    seenReplayInput = undefined;
    hmacResult = true;
    replayResult = true;

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
        async verifyHmac(input, pluginId) {
          seenHmacInput = input;
          seenPluginId = pluginId;
          return hmacResult;
        },
        async checkReplay(input, pluginId) {
          seenReplayInput = input;
          seenPluginId = pluginId;
          return replayResult;
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
      events: { async publish() {} },
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

  it('verifyHmac resolves pluginId from the x-sovereign-plugin-id header', async () => {
    const headers = new Headers({ 'x-sovereign-plugin-id': 'com.example.provider' });
    const input: VerifyWebhookHmacInput = {
      body: new Uint8Array([1, 2, 3]),
      signatureHeader: 'abc',
      secretRef: 'secret-1',
      algorithm: 'sha256',
    };
    const result = await webhooks.verifyHmac(input, headers);
    expect(seenPluginId).toBe('com.example.provider');
    expect(seenHmacInput).toBe(input);
    expect(result).toBe(true);
  });

  it('verifyHmac returns false (fail closed) with no plugin id header, without calling the host', async () => {
    const headers = new Headers();
    const result = await webhooks.verifyHmac(
      { body: new Uint8Array(), signatureHeader: 'abc', secretRef: 's', algorithm: 'sha256' },
      headers,
    );
    expect(result).toBe(false);
    expect(seenPluginId).toBeUndefined();
  });

  it('checkReplay resolves pluginId from the x-sovereign-plugin-id header', async () => {
    const headers = new Headers({ 'x-sovereign-plugin-id': 'com.example.provider' });
    const input: CheckWebhookReplayInput = { provider: 'stripe', eventId: 'evt_1' };
    const result = await webhooks.checkReplay(input, headers);
    expect(seenPluginId).toBe('com.example.provider');
    expect(seenReplayInput).toBe(input);
    expect(result).toBe(true);
  });

  it('checkReplay returns false (fail closed) with no plugin id header, without calling the host', async () => {
    const headers = new Headers();
    const result = await webhooks.checkReplay({ provider: 'stripe', eventId: 'evt_1' }, headers);
    expect(result).toBe(false);
    expect(seenPluginId).toBeUndefined();
  });

  it('forwards the host verifyHmac result through unchanged', async () => {
    hmacResult = false;
    const headers = new Headers({ 'x-sovereign-plugin-id': 'com.example.provider' });
    const result = await webhooks.verifyHmac(
      { body: new Uint8Array(), signatureHeader: 'abc', secretRef: 's', algorithm: 'sha256' },
      headers,
    );
    expect(result).toBe(false);
  });
});
