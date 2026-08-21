import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordEmailDelivery = vi.fn();
const resolveEffectiveMailerConfig = vi.fn();
const createMailer = vi.fn();
const getPlatformDb = vi.fn();
const mailerSend = vi.fn();

vi.mock('@sovereignfs/db', () => ({
  recordEmailDelivery: (...args: unknown[]) => recordEmailDelivery(...args),
}));

vi.mock('@sovereignfs/mailer', () => ({
  createMailer: (...args: unknown[]) => createMailer(...args),
}));

vi.mock('../activity', () => ({ logActivity: vi.fn() }));

vi.mock('../db', () => ({
  getPlatformDb: () => getPlatformDb(),
}));

vi.mock('../smtp-settings', () => ({
  resolveEffectiveMailerConfig: (...args: unknown[]) => resolveEffectiveMailerConfig(...args),
}));

const { getMailer, sendPluginRawEmail } = await import('../platform-email');

const PLATFORM_DB = { dialect: 'sqlite', db: 'db-marker' };

beforeEach(() => {
  vi.clearAllMocks();
  getPlatformDb.mockResolvedValue(PLATFORM_DB);
  resolveEffectiveMailerConfig.mockResolvedValue({ host: 'smtp.example.com' });
  createMailer.mockImplementation((config: { host?: string }) => ({
    configured: Boolean(config.host),
    send: mailerSend,
  }));
});

describe('getMailer', () => {
  it('resolves a fresh mailer from the current Console-effective config on every call, never a cached instance', async () => {
    await getMailer();
    await getMailer();

    // Two independent resolutions, not one memoized at module load — a
    // Console SMTP change must take effect on the very next call.
    expect(resolveEffectiveMailerConfig).toHaveBeenCalledTimes(2);
    expect(createMailer).toHaveBeenCalledTimes(2);
  });

  it('reflects a config change between calls with no restart', async () => {
    resolveEffectiveMailerConfig.mockResolvedValueOnce({ host: undefined });
    const unconfigured = await getMailer();
    expect(unconfigured.configured).toBe(false);

    resolveEffectiveMailerConfig.mockResolvedValueOnce({ host: 'smtp.example.com' });
    const configured = await getMailer();
    expect(configured.configured).toBe(true);
  });
});

describe('sendPluginRawEmail', () => {
  it('resolves the mailer fresh (not a module-level singleton) for a raw plugin send', async () => {
    await sendPluginRawEmail({
      to: 'external@example.com',
      subject: 'Hello',
      pluginId: 'fs.example.widget',
    });

    expect(resolveEffectiveMailerConfig).toHaveBeenCalledTimes(1);
    expect(mailerSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'external@example.com', subject: 'Hello' }),
    );
  });

  it('records a sent delivery-log row attributed to the calling plugin', async () => {
    await sendPluginRawEmail({
      to: 'external@example.com',
      subject: 'Hello',
      pluginId: 'fs.example.widget',
    });

    expect(recordEmailDelivery).toHaveBeenCalledTimes(1);
    expect(recordEmailDelivery).toHaveBeenCalledWith(
      PLATFORM_DB,
      expect.objectContaining({
        status: 'sent',
        source: 'plugin',
        metadata: { pluginId: 'fs.example.widget' },
      }),
    );
  });

  it('records one delivery-log row per recipient when `to` is an array', async () => {
    await sendPluginRawEmail({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Hello',
      pluginId: 'fs.example.widget',
    });

    expect(recordEmailDelivery).toHaveBeenCalledTimes(2);
  });

  it('no-ops (skips the send, logs skipped) when SMTP is unconfigured, without throwing', async () => {
    resolveEffectiveMailerConfig.mockResolvedValue({ host: undefined });

    await expect(
      sendPluginRawEmail({
        to: 'external@example.com',
        subject: 'Hello',
        pluginId: 'fs.example.widget',
      }),
    ).resolves.toBeUndefined();

    expect(mailerSend).not.toHaveBeenCalled();
    expect(recordEmailDelivery).toHaveBeenCalledWith(
      PLATFORM_DB,
      expect.objectContaining({ status: 'skipped', errorCode: 'SMTP_NOT_CONFIGURED' }),
    );
  });

  it('records a failed delivery-log row and rethrows when the actual send fails', async () => {
    mailerSend.mockRejectedValueOnce(new Error('boom'));

    await expect(
      sendPluginRawEmail({
        to: 'external@example.com',
        subject: 'Hello',
        pluginId: 'fs.example.widget',
      }),
    ).rejects.toThrow('boom');

    expect(recordEmailDelivery).toHaveBeenCalledWith(
      PLATFORM_DB,
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
