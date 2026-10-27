import { Secret } from './secret.js';

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export type VariableKind = 'string' | 'secret' | 'boolean' | 'integer' | 'oneOf' | 'list' | 'url';

/**
 * One declared setting. The builders below return these; `defineConfig` reads
 * them. `resolve` turns the raw text (or `undefined` when unset) into the final
 * value, and it is where the type `T` comes from.
 */
export interface Variable<T> {
  readonly kind: VariableKind;
  /** The name without its prefix, e.g. `AUTH_SECRET`. */
  readonly name: string;
  readonly secret: boolean;
  readonly required: boolean;
  readonly description: string | undefined;
  readonly hasDefault: boolean;
  readonly default: unknown;
  readonly choices: readonly string[] | undefined;
  readonly resolve: (raw: string | undefined) => Parsed<T>;
}

type Base = { name: string; description?: string };
type Required_ = Base & { required: true; default?: never };
type Optional_ = Base & { required?: false; default?: undefined };
type Defaulted<D> = Base & { required?: false; default: D };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (message: string): Parsed<never> => ({ ok: false, message });

type Spec = {
  kind: VariableKind;
  options: Base & { required?: boolean; default?: unknown };
  secret?: boolean;
  choices?: readonly string[];
  /** Parses a value that is set. */
  parse: (raw: string) => Parsed<unknown>;
};

/** Builds the variable: the same handling of "unset" for every kind. */
function make<T>({ kind, options, secret = false, choices, parse }: Spec): Variable<T> {
  const required = options.required === true;
  const hasDefault = options.default !== undefined;
  return {
    kind,
    name: options.name,
    secret,
    required,
    description: options.description,
    hasDefault,
    default: secret ? undefined : options.default,
    choices,
    resolve(raw) {
      if (raw === undefined) {
        if (required) return fail('is required but not set');
        return ok(options.default as T);
      }
      return parse(raw) as Parsed<T>;
    },
  };
}

// ---- string -------------------------------------------------------------------

export function string(options: Required_ | Defaulted<string>): Variable<string>;
export function string(options: Optional_): Variable<string | undefined>;
export function string(
  options: Base & { required?: boolean; default?: string },
): Variable<unknown> {
  return make({ kind: 'string', options, parse: (raw) => ok(raw) });
}

// ---- boolean ------------------------------------------------------------------

export function boolean(options: Required_ | Defaulted<boolean>): Variable<boolean>;
export function boolean(options: Optional_): Variable<boolean | undefined>;
export function boolean(
  options: Base & { required?: boolean; default?: boolean },
): Variable<unknown> {
  return make({
    kind: 'boolean',
    options,
    // Exactly `true` or `false`: "1", "yes" and "TRUE" are guesses, and a guess
    // about a setting that may open access is how a deployment goes wrong.
    parse: (raw) =>
      raw === 'true' ? ok(true) : raw === 'false' ? ok(false) : fail('must be true or false'),
  });
}

// ---- integer ------------------------------------------------------------------

type IntegerRange = { min?: number; max?: number };

export function integer(options: (Required_ | Defaulted<number>) & IntegerRange): Variable<number>;
export function integer(options: Optional_ & IntegerRange): Variable<number | undefined>;
export function integer(
  options: Base & { required?: boolean; default?: number } & IntegerRange,
): Variable<unknown> {
  return make({
    kind: 'integer',
    options,
    parse(raw) {
      const value = /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN;
      if (!Number.isSafeInteger(value)) return fail('must be a whole number');
      if (options.min !== undefined && value < options.min)
        return fail(`must be at least ${options.min}`);
      if (options.max !== undefined && value > options.max)
        return fail(`must be at most ${options.max}`);
      return ok(value);
    },
  });
}

// ---- oneOf --------------------------------------------------------------------

export function oneOf<const C extends readonly string[]>(
  choices: C,
  options: Required_ | Defaulted<C[number]>,
): Variable<C[number]>;
export function oneOf<const C extends readonly string[]>(
  choices: C,
  options: Optional_,
): Variable<C[number] | undefined>;
export function oneOf(
  choices: readonly string[],
  options: Base & { required?: boolean; default?: string },
): Variable<unknown> {
  return make({
    kind: 'oneOf',
    options,
    choices,
    parse: (raw) =>
      choices.includes(raw) ? ok(raw) : fail(`must be one of: ${choices.join(', ')}`),
  });
}

// ---- list ---------------------------------------------------------------------

export function list(options: Required_ | Defaulted<string[]>): Variable<string[]>;
export function list(options: Optional_): Variable<string[] | undefined>;
export function list(
  options: Base & { required?: boolean; default?: string[] },
): Variable<unknown> {
  return make({
    kind: 'list',
    options,
    parse(raw) {
      const items = raw.split(',').map((item) => item.trim());
      return items.some((item) => item === '') ? fail('has an empty item') : ok(items);
    },
  });
}

// ---- url ----------------------------------------------------------------------

type UrlOptions = {
  /** Allowed schemes, with the colon. Default `['http:', 'https:']`. */
  protocols?: readonly string[];
  /** Require a bare origin: no path, query or fragment. The value is the origin. */
  origin?: boolean;
};

export function url(options: (Required_ | Defaulted<string>) & UrlOptions): Variable<string>;
export function url(options: Optional_ & UrlOptions): Variable<string | undefined>;
export function url(
  options: Base & { required?: boolean; default?: string } & UrlOptions,
): Variable<unknown> {
  const protocols = options.protocols ?? ['http:', 'https:'];
  return make({
    kind: 'url',
    options,
    parse(raw) {
      const parsed = parseUrl(raw);
      if (!parsed) return fail('is not a valid URL');
      if (!protocols.includes(parsed.protocol)) return fail(`must use ${protocols.join(' or ')}`);
      // An address with a password in it is a secret; it belongs in secret().
      if (parsed.username || parsed.password) {
        return fail('must not contain a username or password; use a secret for that');
      }
      if (options.origin) {
        if ((parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) {
          return fail('must be an address with no path, query or fragment');
        }
        return ok(parsed.origin);
      }
      // No trailing slash, so `${value}/x` is always one slash.
      return ok(parsed.origin + trimTrailingSlashes(parsed.pathname) + parsed.search + parsed.hash);
    },
  });
}

/** An index scan, not `/\/+$/`: an anchored quantifier is quadratic on a long run of slashes. */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

function parseUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

// ---- secret -------------------------------------------------------------------

type SecretOptions = {
  /** The fewest characters accepted. */
  minLength?: number;
  /** The value is an address (it may carry a password); check it is one. */
  url?: { protocols: readonly string[] };
};

/**
 * A setting that must not be logged. It also accepts a `_FILE` form (`NAME_FILE`
 * names a file holding the value, as container secrets do). There is no `default`
 * option and no overload that takes one: a secret with a default is a secret every
 * installation shares.
 */
export function secret(options: Base & { required: true } & SecretOptions): Variable<Secret>;
export function secret(
  options: Base & { required?: false; default?: never } & SecretOptions,
): Variable<Secret | undefined>;
export function secret(options: Base & { required?: boolean } & SecretOptions): Variable<unknown> {
  return make({
    kind: 'secret',
    options,
    secret: true,
    parse(raw) {
      if (options.minLength !== undefined && raw.length < options.minLength) {
        return fail(`must be at least ${options.minLength} characters`);
      }
      if (options.url) {
        const parsed = parseUrl(raw);
        if (!parsed) return fail('is not a valid URL');
        if (!options.url.protocols.includes(parsed.protocol)) {
          return fail(`must use ${options.url.protocols.join(' or ')}`);
        }
      }
      return ok(new Secret(raw));
    },
  });
}
