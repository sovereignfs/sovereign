import {
  renderEmail,
  type EmailRequest,
  type RenderedEmail,
  type SentMail,
} from '@sovereignfs/mailer';
import type { CoreConfig } from '../config';
import { SETTINGS } from '../settings/definitions';
import type { SettingsStore } from '../settings/store';
import type { MailService } from './service';

/**
 * The address of a page on core, for a link in an email: core's public address (`SV_URL`) plus a
 * path and query parameters, which are encoded. This is the only way a flow should build a link
 * for an email, so none is ever made from a request's `Host` header (a forged one would send a
 * reset token to whoever chose it); the renderer also refuses any link not on `SV_URL`.
 */
export function emailLink(
  config: Pick<CoreConfig, 'url'>,
  path: string,
  params: Record<string, string> = {},
): string {
  // One slash, then a path: "//evil.example" or "https://evil.example" would change the host.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new TypeError('An email link path must start with a single "/".');
  }
  const url = new URL(path, `${config.url}/`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

/**
 * Core's emails: branded with the instance name (the Console setting, else `Sovereign`) and linked
 * to `SV_URL`. English is the default template (core-app §3.14); editing templates is not part of
 * Phase 1. The logo is passed through when core has one to give: images arrive with the Console's
 * instance settings, and until then emails carry the name as text.
 */
export class EmailService {
  readonly #mail: MailService;
  readonly #settings: SettingsStore;
  readonly #config: CoreConfig;
  readonly #logoUrl: () => Promise<string | undefined>;

  constructor(options: {
    mail: MailService;
    settings: SettingsStore;
    config: CoreConfig;
    logoUrl?: () => Promise<string | undefined>;
  }) {
    this.#mail = options.mail;
    this.#settings = options.settings;
    this.#config = options.config;
    this.#logoUrl = options.logoUrl ?? (() => Promise.resolve(undefined));
  }

  /** A link to a page on core, for an email. */
  link(path: string, params?: Record<string, string>): string {
    return emailLink(this.#config, path, params);
  }

  /** Renders an email with the instance's branding. Throws if its link is not on `SV_URL`. */
  async render(request: EmailRequest): Promise<RenderedEmail> {
    const name = (await this.#settings.get(SETTINGS.instanceName)).value ?? 'Sovereign';
    const logoUrl = await this.#logoUrl();
    return renderEmail(request, {
      name,
      instanceUrl: this.#config.url,
      ...(logoUrl ? { logoUrl } : {}),
    });
  }

  /**
   * Renders and sends. Fails, saying why, when the link is wrong or email is not set up: a flow
   * that needs this email must not carry on as if it had been sent.
   */
  async send(to: string, request: EmailRequest): Promise<SentMail> {
    const email = await this.render(request);
    return this.#mail.send({ to, subject: email.subject, text: email.text, html: email.html });
  }
}
