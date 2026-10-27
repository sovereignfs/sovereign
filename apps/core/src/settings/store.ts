import type { FieldCipher } from '@sovereignfs/crypto';
import { isDecryptionError } from '@sovereignfs/crypto';
import type { Database } from '@sovereignfs/database';
import type { CoreConfig } from '../config';
import { ALL_SETTINGS, type AnySetting, type SettingDefinition } from './definitions';

export type SettingSource = 'saved' | 'environment' | 'default' | 'unset';

export type ResolvedSetting<T> = {
  /** The value that applies, or `undefined` when the setting is off. */
  value: T | undefined;
  /** Where it came from. `unset`: no saved value, no variable, no built-in default. */
  source: SettingSource;
  /**
   * A saved secret that cannot be decrypted (its key left the ring, or it was altered).
   * `value` is then `undefined` and the environment is **not** substituted: the Console
   * should ask for the secret again, and nothing should quietly run on another credential.
   */
  unreadable: boolean;
};

export type DescribedSetting = {
  key: string;
  source: SettingSource;
  secret: boolean;
  /** Never set for a secret: a saved secret is never shown again. */
  value: string | number | boolean | undefined;
  /** For a secret: whether one is saved (or comes from the environment). */
  hasValue: boolean;
  unreadable: boolean;
  updatedAt: number | undefined;
  updatedBy: string | undefined;
};

export type SettingsErrorCode =
  'no-database' | 'encryption-required' | 'invalid-value' | 'unreadable';

export class SettingsError extends Error {
  override name = 'SettingsError';

  constructor(
    readonly code: SettingsErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type SettingsStoreOptions = {
  /** `undefined` when core runs without a database: reads fall back to the environment, writes are refused. */
  database: Database | undefined;
  /** `undefined` when no key ring is set: secrets cannot be saved. */
  cipher: FieldCipher | undefined;
  config: CoreConfig;
  /**
   * How long a read value is kept. Another instance's change shows within this time; this
   * instance's own change shows at once. 0 reads the database every time.
   */
  cacheMs?: number;
  now?: () => number;
};

type Row = { value: string; encrypted: number; updated_at: number; updated_by: string | null };

const TABLE = 'instance_settings';

const contextOf = (key: string) => `${TABLE}.${key}`;

function encode(value: string | number | boolean): string {
  return typeof value === 'string' ? value : String(value);
}

function decode(setting: AnySetting, raw: string): string | number | boolean | undefined {
  switch (setting.kind) {
    case 'string':
      return raw;
    case 'boolean':
      return raw === 'true' ? true : raw === 'false' ? false : undefined;
    case 'integer': {
      const parsed = Number(raw);
      return Number.isSafeInteger(parsed) ? parsed : undefined;
    }
  }
}

/**
 * Core's instance settings: a value saved in the Console wins over the environment variable,
 * which wins over the built-in default, and clearing the saved value returns to the
 * environment. Changes apply without a restart.
 *
 * Secret settings are stored encrypted (`@sovereignfs/crypto`), bound to their row, and never
 * described back: `describe` says whether one is saved, not what it is.
 */
export class SettingsStore {
  readonly #database: Database | undefined;
  readonly #cipher: FieldCipher | undefined;
  readonly #config: CoreConfig;
  readonly #cacheMs: number;
  readonly #now: () => number;
  readonly #cache = new Map<string, { at: number; resolved: ResolvedSetting<unknown> }>();

  constructor(options: SettingsStoreOptions) {
    this.#database = options.database;
    this.#cipher = options.cipher;
    this.#config = options.config;
    this.#cacheMs = options.cacheMs ?? 5000;
    this.#now = options.now ?? Date.now;
  }

  /** The value that applies, and where it came from. */
  async get<T extends string | boolean | number>(
    setting: SettingDefinition<T>,
  ): Promise<ResolvedSetting<T>> {
    const cached = this.#cache.get(setting.key);
    if (cached && this.#now() - cached.at < this.#cacheMs)
      return cached.resolved as ResolvedSetting<T>;
    const resolved = (await this.#resolve(setting)) as ResolvedSetting<T>;
    this.#cache.set(setting.key, { at: this.#now(), resolved });
    return resolved;
  }

  /** Just the value, for callers that do not care where it came from. */
  async value<T extends string | boolean | number>(
    setting: SettingDefinition<T>,
  ): Promise<T | undefined> {
    return (await this.get(setting)).value;
  }

  /** Saves a value, replacing any earlier one. It applies at once on this instance. */
  async set<T extends string | boolean | number>(
    setting: SettingDefinition<T>,
    value: T,
    actor?: string,
  ): Promise<void> {
    const database = this.#requireDatabase();
    let stored = encode(value);
    // It must survive the round trip: a number that is not a safe integer, say, would not.
    if (decode(setting, stored) !== value) {
      throw new SettingsError('invalid-value', `${setting.key} must be a ${setting.kind}.`);
    }
    const problem = setting.problem(value);
    if (problem) throw new SettingsError('invalid-value', `${setting.key} ${problem}.`);

    if (setting.secret) {
      if (!this.#cipher) {
        throw new SettingsError(
          'encryption-required',
          `${setting.key} is a secret, and there is no field encryption key ring to store it with.`,
        );
      }
      stored = this.#cipher.encrypt(stored, contextOf(setting.key));
    }
    await database.run(
      `insert into ${TABLE} (key, value, encrypted, updated_at, updated_by) values (?, ?, ?, ?, ?)
       on conflict (key) do update set value = excluded.value, encrypted = excluded.encrypted,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [setting.key, stored, setting.secret ? 1 : 0, this.#now(), actor ?? null],
    );
    this.#cache.delete(setting.key);
  }

  /** Removes the saved value, so the environment (or the built-in default) applies again. */
  async clear(setting: AnySetting): Promise<boolean> {
    const database = this.#requireDatabase();
    const { rowsAffected } = await database.run(`delete from ${TABLE} where key = ?`, [
      setting.key,
    ]);
    this.#cache.delete(setting.key);
    return rowsAffected > 0;
  }

  /** Every setting as the Console shows it: never a secret's value. */
  async describeAll(): Promise<DescribedSetting[]> {
    const described: DescribedSetting[] = [];
    for (const setting of ALL_SETTINGS) described.push(await this.describe(setting));
    return described;
  }

  async describe(setting: AnySetting): Promise<DescribedSetting> {
    const resolved = await this.#resolve(setting);
    const row = await this.#row(setting.key);
    return {
      key: setting.key,
      source: resolved.source,
      secret: setting.secret,
      value: setting.secret ? undefined : (resolved.value as string | number | boolean | undefined),
      hasValue: resolved.value !== undefined || resolved.unreadable,
      unreadable: resolved.unreadable,
      updatedAt: row ? Number(row.updated_at) : undefined,
      updatedBy: row?.updated_by ?? undefined,
    };
  }

  #requireDatabase(): Database {
    if (!this.#database) {
      throw new SettingsError(
        'no-database',
        'Settings cannot be saved: core has no database configured.',
      );
    }
    return this.#database;
  }

  async #row(key: string): Promise<Row | undefined> {
    if (!this.#database) return undefined;
    const { rows } = await this.#database.run(
      `select value, encrypted, updated_at, updated_by from ${TABLE} where key = ?`,
      [key],
    );
    return rows[0] as Row | undefined;
  }

  async #resolve(setting: AnySetting): Promise<ResolvedSetting<unknown>> {
    const row = await this.#row(setting.key);
    if (row) {
      const raw = Number(row.encrypted) === 1 ? this.#decrypt(setting, row.value) : row.value;
      const value = raw === undefined ? undefined : decode(setting, raw);
      // A saved value that no longer parses (edited by hand) is treated like an unreadable one.
      if (value === undefined) return { value: undefined, source: 'saved', unreadable: true };
      return { value, source: 'saved', unreadable: false };
    }
    const fromEnvironment = setting.fromEnvironment(this.#config);
    if (fromEnvironment !== undefined)
      return { value: fromEnvironment, source: 'environment', unreadable: false };
    if (setting.builtin !== undefined)
      return { value: setting.builtin, source: 'default', unreadable: false };
    return { value: undefined, source: 'unset', unreadable: false };
  }

  /** The secret in the clear, or `undefined` when it cannot be read (no key ring, a key gone, or altered). */
  #decrypt(setting: AnySetting, stored: string): string | undefined {
    if (!this.#cipher) return undefined;
    try {
      return this.#cipher.decrypt(stored, contextOf(setting.key));
    } catch (error) {
      if (isDecryptionError(error)) return undefined;
      throw error;
    }
  }
}
