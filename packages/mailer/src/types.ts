/** An SMTP server and how to reach it. Everything comes from the caller: this package reads no environment. */
export interface SmtpSettings {
  host: string;
  /** Default 587, the submission port (STARTTLS). 465 is implicit TLS. */
  port: number;
  /** With `password`: the credentials. Set both or neither. */
  user?: string;
  password?: string;
  /** The sender of every message that does not name its own. A bare address or `Name <address>`. */
  from: string;
  /** Implicit TLS from the first byte. Defaults to true on port 465, false otherwise. */
  secure?: boolean;
}

export interface MailMessage {
  /** One address, or several. Bare addresses only: a display name here is refused. */
  to: string | readonly string[];
  subject: string;
  /** At least one of `text` and `html`. Send both: some clients show only the text. */
  text?: string;
  html?: string;
  /** Overrides the configured sender for this message. */
  from?: string;
}

/** A message ready to hand to a transport: validated, with its sender settled. */
export interface ComposedMessage {
  from: string;
  to: readonly string[];
  subject: string;
  text: string | undefined;
  html: string | undefined;
}

export interface SentMail {
  /** The addresses the server accepted. */
  accepted: readonly string[];
  /** The addresses it refused; a send that is partly refused is still a send. */
  rejected: readonly string[];
}

/** Delivers a composed message. The SMTP transport is the real one; the memory transport is for tests. */
export interface Transport {
  send(message: ComposedMessage): Promise<SentMail>;
  /** Releases connections. Optional: the memory transport has none. */
  close?(): void;
}

export interface Mailer {
  /** Validates and sends. Throws a `MailError`: never resolves for a message that was not sent. */
  send(message: MailMessage): Promise<SentMail>;
}
