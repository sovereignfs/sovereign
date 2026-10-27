import type { CoreConfig } from '../config';

/**
 * The settings an operator can change in the Console (core-app §3.12). A setting resolves,
 * in order, to: the value saved in the Console, the environment variable, the built-in
 * default. Clearing the saved value returns it to the environment.
 */
export type SettingKind = 'string' | 'boolean' | 'integer';

export type SettingDefinition<T extends string | boolean | number = string | boolean | number> = {
  /** The row key in `instance_settings`. Never changes once a value is saved under it. */
  readonly key: string;
  readonly kind: SettingKind;
  /** Stored encrypted, and never shown again once saved. */
  readonly secret: boolean;
  /** What the environment says, when it says anything. */
  readonly fromEnvironment: (config: CoreConfig) => T | undefined;
  /** What applies when neither is set. `undefined` means the setting is simply off. */
  readonly builtin: T | undefined;
  /** Why a value is not acceptable, or `undefined` when it is. */
  readonly problem: (value: T) => string | undefined;
};

function define<T extends string | boolean | number>(
  definition: SettingDefinition<T>,
): SettingDefinition<T> {
  return definition;
}

// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const CONTROL = /[\u0000-\u001f\u007f]/;

const text =
  (max: number) =>
  (value: string): string | undefined => {
    if (value.trim() === '' || value.length > max) return `must be 1-${max} characters`;
    // A line break in the instance name would reach an email subject; no text setting needs one.
    if (CONTROL.test(value)) return 'must not contain line breaks or other control characters';
    return undefined;
  };

const none = (): undefined => undefined;

export const SETTINGS = {
  instanceName: define<string>({
    key: 'instance.name',
    kind: 'string',
    secret: false,
    fromEnvironment: () => undefined,
    builtin: 'Sovereign',
    problem: text(100),
  }),
  /** Unset means invite-only: a setting left unset never opens access (core-app §1.1). */
  inviteOnly: define<boolean>({
    key: 'auth.invite_only',
    kind: 'boolean',
    secret: false,
    fromEnvironment: (config) => config.authInviteOnly,
    builtin: true,
    problem: none,
  }),
  smtpHost: define<string>({
    key: 'smtp.host',
    kind: 'string',
    secret: false,
    fromEnvironment: (config) => config.smtpHost,
    builtin: undefined,
    problem: text(255),
  }),
  smtpPort: define<number>({
    key: 'smtp.port',
    kind: 'integer',
    secret: false,
    fromEnvironment: (config) => config.smtpPort,
    builtin: undefined,
    problem: (value) => (value < 1 || value > 65535 ? 'must be between 1 and 65535' : undefined),
  }),
  smtpUser: define<string>({
    key: 'smtp.user',
    kind: 'string',
    secret: false,
    fromEnvironment: (config) => config.smtpUser,
    builtin: undefined,
    problem: text(255),
  }),
  smtpFrom: define<string>({
    key: 'smtp.from',
    kind: 'string',
    secret: false,
    fromEnvironment: (config) => config.smtpFrom,
    builtin: undefined,
    problem: text(255),
  }),
  smtpPassword: define<string>({
    key: 'smtp.password',
    kind: 'string',
    secret: true,
    fromEnvironment: (config) => config.smtpPassword?.reveal(),
    builtin: undefined,
    problem: (value) =>
      value === '' || value.length > 1024 ? 'must be 1-1024 characters' : undefined,
  }),
} as const;

export type SettingName = keyof typeof SETTINGS;

/** A setting with its value type erased, for code that handles every setting alike. */
export type AnySetting = {
  readonly key: string;
  readonly kind: SettingKind;
  readonly secret: boolean;
  readonly fromEnvironment: (config: CoreConfig) => unknown;
  readonly builtin: unknown;
  readonly problem: (value: never) => string | undefined;
};

export const ALL_SETTINGS: readonly AnySetting[] = Object.values(SETTINGS);
