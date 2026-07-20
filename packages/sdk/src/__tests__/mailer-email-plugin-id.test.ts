import { beforeEach, describe, expect, it } from 'vitest';
import { provideHost } from '../host';
import { send } from '../mailer';
import { email } from '../email';

/**
 * Proves that `sdk.mailer.send()` and `sdk.email.sendToUser()` resolve the
 * calling plugin's ID exclusively from the `x-sovereign-plugin-id` request
 * header — never from caller-supplied input — so a plugin cannot forge its
 * own source identity (RFC 0062). `MailOptions` and `SendToUserEmailInput`
 * have no plugin-id-like field at all; this test pins the runtime behavior
 * that would matter even if one were ever added by mistake.
 */
describe('sdk.mailer / sdk.email — plugin ID resolution (RFC 0062)', () => {
  let capturedMailerPluginId: string | null | undefined;
  let capturedEmailPluginId: string | null | undefined;

  beforeEach(() => {
    capturedMailerPluginId = undefined;
    capturedEmailPluginId = undefined;
    provideHost({
      db: {
        async getClient() {
          return {};
        },
      },
      mailer: {
        async send(_options, pluginId) {
          capturedMailerPluginId = pluginId;
        },
      },
      email: {
        async sendToUser(_input, pluginId) {
          capturedEmailPluginId = pluginId;
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
        provide() {},
        async query() {
          return [];
        },
      },
      activity: { async log() {} },
      portability: { provideExport() {}, provideImport() {}, provideDelete() {} },
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
      notifications: { async send() {} },
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
        async delete() {},
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
        async disconnect() {},
        async markUsed() {},
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
      storage: {
        async put() {
          return {} as never;
        },
        async get() {
          return null;
        },
        async delete() {},
        async list() {
          return [];
        },
        async getSignedUrl() {
          return '';
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
        async revokeDevice() {},
      },
    });
  });

  it('mailer.send resolves pluginId from the x-sovereign-plugin-id header', async () => {
    const headers = new Headers({ 'x-sovereign-plugin-id': 'com.example.notes' });
    await send({ to: 'user@example.com', subject: 'Hi' }, headers);
    expect(capturedMailerPluginId).toBe('com.example.notes');
  });

  it('mailer.send resolves pluginId to null when no headers are passed', async () => {
    await send({ to: 'user@example.com', subject: 'Hi' });
    expect(capturedMailerPluginId).toBeNull();
  });

  it('email.sendToUser resolves pluginId from the x-sovereign-plugin-id header', async () => {
    const headers = new Headers({ 'x-sovereign-plugin-id': 'com.example.notes' });
    await email.sendToUser(
      { recipientUserId: 'u1', templateId: 'export-ready', subject: 'Ready' },
      headers,
    );
    expect(capturedEmailPluginId).toBe('com.example.notes');
  });

  it('email.sendToUser resolves pluginId to null when no headers are passed', async () => {
    await email.sendToUser({ recipientUserId: 'u1', templateId: 'export-ready', subject: 'Ready' });
    expect(capturedEmailPluginId).toBeNull();
  });
});
