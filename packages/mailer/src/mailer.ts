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
/**
 * Dev fallback target (Mailpit). An IP literal, not `localhost`, on purpose:
 * nodemailer resolves a *hostname* with real DNS queries (`dns.resolve4` +
 * `dns.resolve6`, see nodemailer's `shared.resolveHostname`), not the OS
 * resolver that knows `localhost` from /etc/hosts. Depending on the network's
 * DNS server that pair of queries for `localhost` can hang for ~6s before
 * nodemailer caches the answer — paid once per process, on the first email
 * sent, which is exactly the account-created email in the sign-up hook. So
 * the very first registration on a dev server took >6s and the browser e2e
 * for it timed out. `net.isIP(host)` short-circuits resolution entirely.
 */
const DEV_FALLBACK_HOST = '127.0.0.1';
const DEV_FALLBACK_PORT = 1025;

/**
 * nodemailer's own defaults are 2 minutes to connect, 30s for the greeting
 * and 10 minutes of socket idle. Every send in this codebase is awaited from
 * a request handler (sign-up, password reset, …), so an unreachable SMTP
 * host would hold that request for the whole connect timeout. These bound
 * the worst case; a legitimately slow relay still has ample room.
 */
export const SMTP_TIMEOUTS_MS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
} as const;

function resolveConfig(config: MailerConfig, env: NodeJS.ProcessEnv): MailerConfig {
  const isDev = env.NODE_ENV !== 'production';
  const host = config.host ?? env.SMTP_HOST ?? (isDev ? DEV_FALLBACK_HOST : undefined);
  const port =
    config.port ??
    (env.SMTP_PORT
      ? Number(env.SMTP_PORT)
      : isDev && !env.SMTP_HOST
        ? DEV_FALLBACK_PORT
        : undefined);
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
 * 127.0.0.1:1025 when SMTP_HOST is unset so dev email works out of the box.
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
      ...SMTP_TIMEOUTS_MS,
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
