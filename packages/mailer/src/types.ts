export interface MailerConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  /** Default sender address (e.g. "Sovereign <no-reply@example.com>"). */
  from?: string;
  /** Use an implicit TLS connection. Defaults to true when port is 465. */
  secure?: boolean;
}

export interface MailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Overrides the configured default sender for this message. */
  from?: string;
}

export interface Mailer {
  /** True when SMTP is configured (SMTP_HOST is set); false means send() no-ops. */
  readonly configured: boolean;
  send(options: MailOptions): Promise<void>;
}
