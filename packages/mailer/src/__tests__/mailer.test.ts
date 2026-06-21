import { afterEach, describe, expect, it, vi } from 'vitest';
import nodemailer, { type Transporter } from 'nodemailer';
import { createMailer } from '../mailer';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
}));

const createTransport = vi.mocked(nodemailer.createTransport);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('createMailer', () => {
  it('no-ops when SMTP_HOST is set to empty string (does not throw, does not send)', async () => {
    vi.stubEnv('SMTP_HOST', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const mailer = createMailer();
    expect(mailer.configured).toBe(false);
    await expect(
      mailer.send({ to: 'a@b.c', subject: 'Hello', text: 'hi' }),
    ).resolves.toBeUndefined();

    expect(createTransport).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('sends via nodemailer when configured, mapping fields', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_FROM', 'Sovereign <no-reply@example.com>');
    const sendMail = vi.fn().mockResolvedValue(undefined);
    createTransport.mockReturnValue({ sendMail } as unknown as Transporter);

    const mailer = createMailer();
    expect(mailer.configured).toBe(true);
    await mailer.send({ to: 'user@example.com', subject: 'Welcome', html: '<p>Hi</p>' });

    expect(createTransport).toHaveBeenCalledOnce();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Sovereign <no-reply@example.com>',
        to: 'user@example.com',
        subject: 'Welcome',
        html: '<p>Hi</p>',
      }),
    );
  });

  it('lets a per-message from override the configured default', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_FROM', 'default@example.com');
    const sendMail = vi.fn().mockResolvedValue(undefined);
    createTransport.mockReturnValue({ sendMail } as unknown as Transporter);

    const mailer = createMailer();
    await mailer.send({ to: 'u@e.c', subject: 'S', text: 't', from: 'override@example.com' });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'override@example.com' }),
    );
  });
});

describe('createMailer — dev Mailpit fallback', () => {
  it('connects to localhost:1025 in non-production when SMTP_HOST is not set', () => {
    // Delete SMTP_HOST so the ?? fallback path is reached (empty string is not null/undefined).
    const saved = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    // NODE_ENV defaults to 'test' in Vitest, which is !== 'production', so isDev = true.
    const sendMail = vi.fn().mockResolvedValue(undefined);
    createTransport.mockReturnValue({ sendMail } as unknown as Transporter);

    try {
      const mailer = createMailer();
      expect(mailer.configured).toBe(true);
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'localhost', port: 1025 }),
      );
    } finally {
      if (saved !== undefined) process.env.SMTP_HOST = saved;
    }
  });

  it('SMTP_HOST env always takes precedence over the dev fallback', () => {
    vi.stubEnv('SMTP_HOST', 'my-smtp-relay.example.com');
    vi.stubEnv('SMTP_PORT', '587');
    const sendMail = vi.fn().mockResolvedValue(undefined);
    createTransport.mockReturnValue({ sendMail } as unknown as Transporter);

    const mailer = createMailer();
    expect(mailer.configured).toBe(true);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'my-smtp-relay.example.com', port: 587 }),
    );
  });

  it('no-ops in production when SMTP_HOST is not set', async () => {
    const saved = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const mailer = createMailer();
      expect(mailer.configured).toBe(false);
      await expect(
        mailer.send({ to: 'a@b.c', subject: 'Test', text: 'hi' }),
      ).resolves.toBeUndefined();
      expect(createTransport).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      if (saved !== undefined) process.env.SMTP_HOST = saved;
      warn.mockRestore();
    }
  });
});
