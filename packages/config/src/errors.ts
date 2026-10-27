/** One thing wrong with the configuration. Never carries a value. */
export type Problem = {
  /** The environment variable at fault, e.g. `SV_AUTH_SECRET_FILE`. */
  variable: string;
  /** Reads after the variable name: "SV_URL is not a valid URL". */
  message: string;
};

/**
 * The configuration is wrong. It lists every problem at once, each naming its
 * variable, and says nothing about any value: a database URL can hold a password,
 * and a refused secret is still a secret.
 */
export class ConfigError extends Error {
  override name = 'ConfigError';

  constructor(readonly problems: readonly Problem[]) {
    const count = problems.length;
    const lines = problems.map((p) => `  - ${p.variable} ${p.message}`);
    super(
      `Invalid configuration (${count} ${count === 1 ? 'problem' : 'problems'}):\n${lines.join('\n')}`,
    );
  }
}
