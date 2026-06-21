import nodemailer, { type Transporter } from 'nodemailer';
import type { Mailer, MailerConfig, MailOptions } from './types';

/**
 * Resolve mailer config from explicit overrides then environment variables:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM. No credentials are ever
 * hardcoded; everything comes from config or env.
 *
 * In non-production environments, falls back to Mailpit defaults (localhost:1025)
 * when no SMTP_HOST is configured so dev email works without any .env change.
 */
function resolveConfig(config: MailerConfig, env: NodeJS.ProcessEnv): MailerConfig {
  const isDev = env.NODE_ENV !== 'production';
  const host = config.host ?? env.SMTP_HOST ?? (isDev ? 'localhost' : undefined);
  const port =
    config.port ??
    (env.SMTP_PORT ? Number(env.SMTP_PORT) : isDev && !env.SMTP_HOST ? 1025 : undefined);
  return {
    host,
    port,
    user: config.user ?? env.SMTP_USER,
    pass: config.pass ?? env.SMTP_PASS,
    from: config.from ?? env.SMTP_FROM,
    secure: config.secure ?? port === 465,
  };
}

/**
 * Create a mailer. In non-production environments, falls back to Mailpit on
 * localhost:1025 when SMTP_HOST is unset so dev email works out of the box.
 * In production with no SMTP_HOST the mailer is a graceful no-op: `send()`
 * logs a warning and resolves without throwing (SRS NFR-02 — email is optional).
 */
export function createMailer(config: MailerConfig = {}): Mailer {
  const resolved = resolveConfig(config, process.env);
  const configured = Boolean(resolved.host);

  let transporter: Transporter | undefined;
  if (configured) {
    transporter = nodemailer.createTransport({
      host: resolved.host,
      port: resolved.port ?? 587,
      secure: resolved.secure ?? false,
      auth:
        resolved.user && resolved.pass ? { user: resolved.user, pass: resolved.pass } : undefined,
    });
  }

  return {
    configured,
    async send(options: MailOptions): Promise<void> {
      if (!transporter) {
        console.warn(
          `[mailer] SMTP not configured (SMTP_HOST unset); skipping email "${options.subject}".`,
        );
        return;
      }
      await transporter.sendMail({
        from: options.from ?? resolved.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
    },
  };
}
