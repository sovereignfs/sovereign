import { beforeEach, describe, expect, it } from 'vitest';
import { provideHost } from '../host';
import { jobs } from '../jobs';
import type { EnqueueJobInput, JobRef, ScheduleJobInput } from '../types';

/**
 * Proves that `sdk.jobs.*` resolves the calling plugin's ID and the acting
 * user's ID exclusively from request headers — explicit `Headers`, not
 * `next/headers()`, since these methods must also work from inside a job
 * handler's own synthetic `ctx.headers` (no HTTP request in scope). Mirrors
 * `mailer-email-plugin-id.test.ts`'s focus on header resolution.
 */
describe('sdk.jobs — header resolution', () => {
  let seenPluginId: string | null | undefined;
  let seenUserId: string | null | undefined;
  let seenEnqueueInput: EnqueueJobInput | undefined;
  let seenScheduleInput: ScheduleJobInput | undefined;
  let seenCancelId: string | undefined;
  let seenGetId: string | undefined;

  const stubJobRef: JobRef = {
    id: 'job-1',
    type: 'sync.remote',
    status: 'queued',
    runAt: 0,
    attempts: 0,
    maxAttempts: 3,
    createdAt: 0,
    updatedAt: 0,
  };

  beforeEach(() => {
    seenPluginId = undefined;
    seenUserId = undefined;
    seenEnqueueInput = undefined;
    seenScheduleInput = undefined;
    seenCancelId = undefined;
    seenGetId = undefined;

    provideHost({
      db: {
        async getClient() {
          return {};
        },
      },
      env: {
        async get() {
          return null;
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
      messages: {
        async send() {
          return { messageId: 'msg-1', sentTo: [], skipped: [] };
        },
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
        async enqueue(input, pluginId, userId) {
          seenEnqueueInput = input;
          seenPluginId = pluginId;
          seenUserId = userId;
          return stubJobRef;
        },
        async schedule(input, pluginId, userId) {
          seenScheduleInput = input;
          seenPluginId = pluginId;
          seenUserId = userId;
          return stubJobRef;
        },
        async cancel(id, pluginId) {
          seenCancelId = id;
          seenPluginId = pluginId;
          return true;
        },
        async get(id, pluginId) {
          seenGetId = id;
          seenPluginId = pluginId;
          return stubJobRef;
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

  it('enqueue resolves pluginId and userId from headers', async () => {
    const headers = new Headers({
      'x-sovereign-plugin-id': 'com.example.notes',
      'x-sovereign-user-id': 'user-1',
    });
    await jobs.enqueue({ type: 'sync.remote', payload: { a: 1 } }, headers);
    expect(seenPluginId).toBe('com.example.notes');
    expect(seenUserId).toBe('user-1');
    expect(seenEnqueueInput).toEqual({ type: 'sync.remote', payload: { a: 1 } });
  });

  it('enqueue defaults pluginId to "unknown" and userId to null with no headers', async () => {
    await jobs.enqueue({ type: 'sync.remote' });
    expect(seenPluginId).toBe('unknown');
    expect(seenUserId).toBeNull();
  });

  it('schedule resolves pluginId and userId from headers', async () => {
    const headers = new Headers({
      'x-sovereign-plugin-id': 'com.example.notes',
      'x-sovereign-user-id': 'user-1',
    });
    await jobs.schedule({ type: 'cleanup.expired', cron: '0 3 * * *' }, headers);
    expect(seenPluginId).toBe('com.example.notes');
    expect(seenUserId).toBe('user-1');
    expect(seenScheduleInput).toEqual({ type: 'cleanup.expired', cron: '0 3 * * *' });
  });

  it('cancel resolves pluginId from headers and forwards the job id', async () => {
    const headers = new Headers({ 'x-sovereign-plugin-id': 'com.example.notes' });
    const result = await jobs.cancel('job-1', headers);
    expect(seenPluginId).toBe('com.example.notes');
    expect(seenCancelId).toBe('job-1');
    expect(result).toBe(true);
  });

  it('get resolves pluginId from headers and forwards the job id', async () => {
    const headers = new Headers({ 'x-sovereign-plugin-id': 'com.example.notes' });
    const result = await jobs.get('job-1', headers);
    expect(seenPluginId).toBe('com.example.notes');
    expect(seenGetId).toBe('job-1');
    expect(result).toEqual(stubJobRef);
  });

  it('a job handler can pass its own ctx.headers to enqueue further work', async () => {
    // Synthetic headers, same shape runtime/src/jobs.ts hands to JobContext.
    const syntheticHeaders = new Headers({ 'x-sovereign-plugin-id': 'com.example.notes' });
    await jobs.enqueue({ type: 'followup.task' }, syntheticHeaders);
    expect(seenPluginId).toBe('com.example.notes');
  });
});
