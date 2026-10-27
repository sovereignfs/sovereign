import { ConfigError, type Problem } from './errors.js';
import type { Variable, VariableKind } from './variables.js';

/** What `process.env` is, and what a test passes instead. */
export type Env = Record<string, string | undefined>;

export type ConfigValues<V extends Record<string, Variable<unknown>>> = {
  [K in keyof V]: V[K] extends Variable<infer T> ? T : never;
};

export type LoadOptions = {
  /** Reads a `*_FILE` file. Defaults to the file system; a test passes its own. */
  readFile?: (path: string) => string;
};

/** One row of `describe()`: enough to write the documentation or a `.env.example`. */
export type Description = {
  key: string;
  variable: string;
  /** The `_FILE` form, for a secret. */
  fileVariable?: string;
  kind: VariableKind;
  secret: boolean;
  required: boolean;
  /** Never present for a secret: there are none. */
  default?: unknown;
  choices?: readonly string[];
  description?: string;
};

export interface Config<V extends Record<string, Variable<unknown>>> {
  readonly prefix: string;
  /**
   * Reads and validates every declared variable. Throws one `ConfigError` listing
   * everything that is wrong; returns the typed values otherwise.
   */
  load(env?: Env, options?: LoadOptions): ConfigValues<V>;
  describe(): Description[];
}

const PREFIX = /^[A-Z][A-Z0-9]*$/;
const NAME = /^[A-Z][A-Z0-9_]*$/;
const FILE_SUFFIX = '_FILE';

/**
 * Declares the settings of one app. The prefix is the app's own (`SV` for core),
 * so two apps in one suite never read each other's variables:
 *
 *   const config = defineConfig({
 *     prefix: 'SV',
 *     variables: { authSecret: secret({ name: 'AUTH_SECRET', required: true, minLength: 32 }) },
 *   });
 *   const settings = config.load(); // reads SV_AUTH_SECRET, or the file SV_AUTH_SECRET_FILE names
 */
export function defineConfig<V extends Record<string, Variable<unknown>>>(options: {
  prefix: string;
  variables: V;
}): Config<V> {
  const { prefix, variables } = options;
  if (!PREFIX.test(prefix)) {
    throw new TypeError(
      `The config prefix "${prefix}" must be upper-case letters and digits, starting with a letter.`,
    );
  }

  const seen = new Map<string, string>();
  for (const [key, variable] of Object.entries(variables)) {
    if (!NAME.test(variable.name)) {
      throw new TypeError(
        `The variable name "${variable.name}" (${key}) must be upper-case letters, digits and underscores, starting with a letter.`,
      );
    }
    if (variable.name.endsWith(FILE_SUFFIX)) {
      throw new TypeError(
        `The variable name "${variable.name}" (${key}) ends in ${FILE_SUFFIX}, which is reserved for the file form of a secret.`,
      );
    }
    const full = `${prefix}_${variable.name}`;
    const other = seen.get(full);
    if (other !== undefined)
      throw new TypeError(`${full} is declared twice (${other} and ${key}).`);
    seen.set(full, key);
  }

  const entries = Object.entries(variables);

  return {
    prefix,

    load(env = process.env, loadOptions = {}) {
      const readFile = loadOptions.readFile ?? defaultReadFile;
      const problems: Problem[] = [];
      const values: Record<string, unknown> = {};

      for (const [key, variable] of entries) {
        const full = `${prefix}_${variable.name}`;
        const source = variable.secret
          ? readSecret(full, env, readFile, problems)
          : readPlain(full, env);
        if (source === undefined) continue; // a problem was recorded

        const result = variable.resolve(source.value);
        if (result.ok) {
          values[key] = result.value;
          continue;
        }
        const hint =
          variable.secret && source.value === undefined ? ` (or set ${full}${FILE_SUFFIX})` : '';
        problems.push({ variable: source.variable, message: `${result.message}${hint}` });
      }

      if (problems.length > 0) throw new ConfigError(problems);
      return values as ConfigValues<V>;
    },

    describe() {
      return entries.map(([key, variable]) => {
        const full = `${prefix}_${variable.name}`;
        const row: Description = {
          key,
          variable: full,
          kind: variable.kind,
          secret: variable.secret,
          required: variable.required,
        };
        if (variable.secret) row.fileVariable = `${full}${FILE_SUFFIX}`;
        if (variable.hasDefault && !variable.secret) row.default = variable.default;
        if (variable.choices) row.choices = variable.choices;
        if (variable.description !== undefined) row.description = variable.description;
        return row;
      });
    },
  };
}

type Source = {
  /** The raw text, or `undefined` when the setting is not set. */
  value: string | undefined;
  /** The variable to name if the value is wrong: the plain one, or its `_FILE` form. */
  variable: string;
};

/** A plain setting: blank counts as unset, and surrounding whitespace is not part of it. */
function readPlain(full: string, env: Env): Source {
  const raw = env[full]?.trim();
  return { value: raw === undefined || raw === '' ? undefined : raw, variable: full };
}

/**
 * A secret: `NAME`, or the file `NAME_FILE` names. Setting both is an error, because
 * which one wins is a question nobody should have to answer at 3 a.m. A value given
 * directly is used exactly as written; from a file, one trailing newline (which
 * `echo` and container secrets add) is dropped and nothing else.
 */
function readSecret(
  full: string,
  env: Env,
  readFile: (path: string) => string,
  problems: Problem[],
): Source | undefined {
  const fileVariable = `${full}${FILE_SUFFIX}`;
  const direct = env[full];
  const directSet = direct !== undefined && direct.trim() !== '';
  const path = env[fileVariable]?.trim();
  const fileSet = path !== undefined && path !== '';

  if (directSet && fileSet) {
    problems.push({
      variable: full,
      message: `is set together with ${fileVariable}; set only one`,
    });
    return undefined;
  }
  if (fileSet) {
    let content: string;
    try {
      content = readFile(path);
    } catch {
      // The cause is deliberately not repeated: it can name paths and, rarely, content.
      problems.push({ variable: fileVariable, message: 'names a file that cannot be read' });
      return undefined;
    }
    const value = content.replace(/\r?\n$/, '');
    return value.trim() === ''
      ? { value: undefined, variable: full }
      : { value, variable: fileVariable };
  }
  return { value: directSet ? direct : undefined, variable: full };
}

/**
 * Node's file system without a static `node:fs` import, so this module can be
 * bundled for a runtime that has none; it only fails if a `_FILE` is actually used there.
 */
function defaultReadFile(path: string): string {
  const fs = process.getBuiltinModule('node:fs');
  return fs.readFileSync(path, 'utf8');
}
