import type { Database } from '@sovereignfs/database';
import { isSender } from '@sovereignfs/mailer';
import { brandingPath, type BrandingKind, type BrandingStore } from '../branding/store';
import { can, type Capability } from '../roles/capabilities';
import { loadMatrix } from '../roles/matrix';
import { SETTINGS } from '../settings/definitions';
import { SettingsError, type SettingsStore } from '../settings/store';

export type InstanceErrorCode = 'forbidden' | 'invalid' | 'needs-encryption';

export class InstanceError extends Error {
  override name = 'InstanceError';

  constructor(
    readonly code: InstanceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Actor = { id: string; role: unknown };

export type SmtpInput = {
  host: string;
  /** As typed: empty means the default port. */
  port: string;
  user: string;
  from: string;
  /** Empty keeps the password that is saved; anything else replaces it. */
  password: string;
  /** Forget the saved password. */
  clearPassword?: boolean;
};

const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/;
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * What an operator changes about the instance itself (core-app §3.12): its name, its logos and favicon, whether
 * sign-up needs an invitation, and how email is sent. Every change asks for the capability it needs in the matrix
 * in force, read from the database, so a direct request is held as the page is:
 *
 * - the name, pictures and registration need `instance:configure`;
 * - the SMTP settings need `instance:configure-secrets`, which only the owner holds, and an admin cannot change
 *   them or read them.
 *
 * Each value is checked here, before anything is saved, and clearing one returns it to the environment's.
 */
export class InstanceManager {
  readonly #database: Database;
  readonly #settings: SettingsStore;
  readonly #branding: BrandingStore;

  constructor(database: Database, settings: SettingsStore, branding: BrandingStore) {
    this.#database = database;
    this.#settings = settings;
    this.#branding = branding;
  }

  async #allow(actor: Actor, capability: Capability): Promise<void> {
    if (!can(actor.role, capability, await loadMatrix(this.#database))) {
      throw new InstanceError('forbidden', 'You are not allowed to change that.');
    }
  }

  async saveName(actor: Actor, name: string): Promise<void> {
    await this.#allow(actor, 'instance:configure');
    const trimmed = name.trim();
    if (SETTINGS.instanceName.problem(trimmed)) {
      throw new InstanceError('invalid', 'The name must be 1 to 100 characters, on one line.');
    }
    await this.#settings.set(SETTINGS.instanceName, trimmed, actor.id);
  }

  async resetName(actor: Actor): Promise<void> {
    await this.#allow(actor, 'instance:configure');
    await this.#settings.clear(SETTINGS.instanceName);
  }

  /** Whether sign-up needs an invitation, saved over `SV_AUTH_INVITE_ONLY`. */
  async saveInviteOnly(actor: Actor, inviteOnly: boolean): Promise<void> {
    await this.#allow(actor, 'instance:configure');
    await this.#settings.set(SETTINGS.inviteOnly, inviteOnly, actor.id);
  }

  async resetInviteOnly(actor: Actor): Promise<void> {
    await this.#allow(actor, 'instance:configure');
    await this.#settings.clear(SETTINGS.inviteOnly);
  }

  /** Keeps a picture, or throws an `ImageError` saying why it is not one. */
  async setImage(actor: Actor, kind: BrandingKind, bytes: Buffer): Promise<{ path: string }> {
    await this.#allow(actor, 'instance:configure');
    const stored = await this.#branding.set(kind, bytes, actor.id);
    return { path: brandingPath(kind, stored.version) };
  }

  async removeImage(actor: Actor, kind: BrandingKind): Promise<boolean> {
    await this.#allow(actor, 'instance:configure');
    return this.#branding.remove(kind);
  }

  /** Saves how email is sent. Blank fields return to the environment's values; a blank password keeps the saved one. */
  async saveSmtp(actor: Actor, input: SmtpInput): Promise<void> {
    await this.#allow(actor, 'instance:configure-secrets');
    const host = input.host.trim();
    const user = input.user.trim();
    const from = input.from.trim();
    const portText = input.port.trim();

    if (host !== '' && (!HOST.test(host) || host.length > 255)) {
      throw new InstanceError('invalid', 'That does not look like the name of a mail server.');
    }
    let port: number | undefined;
    if (portText !== '') {
      port = /^[0-9]{1,5}$/.test(portText) ? Number(portText) : Number.NaN;
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new InstanceError('invalid', 'The port is a number from 1 to 65535.');
      }
    }
    if (user !== '' && (user.length > 255 || CONTROL.test(user))) {
      throw new InstanceError(
        'invalid',
        'The user name must be on one line, up to 255 characters.',
      );
    }
    if (from !== '' && !isSender(from)) {
      throw new InstanceError(
        'invalid',
        'The from address must be an email address, or a name followed by one in angle brackets.',
      );
    }
    if (input.password.length > 1024) {
      throw new InstanceError('invalid', 'The password is too long.');
    }

    // The password first: it is the one that can be refused for want of a key, before anything else changes.
    try {
      if (input.clearPassword) await this.#settings.clear(SETTINGS.smtpPassword);
      else if (input.password !== '') {
        await this.#settings.set(SETTINGS.smtpPassword, input.password, actor.id);
      }
    } catch (error) {
      if (error instanceof SettingsError && error.code === 'encryption-required') {
        throw new InstanceError(
          'needs-encryption',
          'A password cannot be saved here until SV_FIELD_ENCRYPTION_KEYS is set. Set SV_SMTP_PASSWORD instead, or set the keys.',
        );
      }
      throw error;
    }
    const fields = [
      [SETTINGS.smtpHost, host === '' ? undefined : host],
      [SETTINGS.smtpPort, port],
      [SETTINGS.smtpUser, user === '' ? undefined : user],
      [SETTINGS.smtpFrom, from === '' ? undefined : from],
    ] as const;
    for (const [setting, value] of fields) {
      if (value === undefined) await this.#settings.clear(setting);
      else await this.#settings.set(setting as never, value as never, actor.id);
    }
  }

  /** Forgets everything saved about email, so the `SV_SMTP_*` variables apply again. */
  async resetSmtp(actor: Actor): Promise<void> {
    await this.#allow(actor, 'instance:configure-secrets');
    for (const setting of [
      SETTINGS.smtpHost,
      SETTINGS.smtpPort,
      SETTINGS.smtpUser,
      SETTINGS.smtpFrom,
      SETTINGS.smtpPassword,
    ]) {
      await this.#settings.clear(setting);
    }
  }
}
