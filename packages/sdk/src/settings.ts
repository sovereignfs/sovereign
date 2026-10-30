import { ConfigError, defineConfig, secret, string, url } from '@sovereignfs/config';
import { ConfigurationError } from './errors';

/** What the SDK needs to know about the app and its core (sdk §2). */
export type Settings = {
  /** The app's own address. */
  appUrl: string;
  /** Core's address, with no path: its issuer. */
  coreUrl: string;
  /** The app's client id in core. */
  clientId: string;
  /** The app's secret in core. Never logged, never returned. */
  clientSecret: string;
};

/** How an app names its settings: by the prefix `spec/env.md` defines, or one by one (an external app). */
export type SettingsSource =
  | {
      /** The app's prefix: `NOTES` reads `NOTES_URL`, `NOTES_CORE_URL`, `NOTES_CORE_CLIENT_ID` and `NOTES_CORE_CLIENT_SECRET`. */
      prefix: string;
      /** The environment to read. Defaults to `process.env`. */
      env?: Record<string, string | undefined>;
      /** Reads a `*_FILE` file. Defaults to the file system; a test passes its own. */
      readFile?: (path: string) => string;
    }
  | { appUrl: string; coreUrl: string; clientId: string; clientSecret: string };

const hasPrefix = (source: SettingsSource): source is Extract<SettingsSource, { prefix: string }> =>
  'prefix' in source;

/**
 * Reads the settings, or throws a `ConfigurationError` naming everything wrong at once and no value (sdk §2). It
 * reads only what it is given and makes no network call, so an app starts while core is down.
 */
export function readSettings(source: SettingsSource): Settings {
  if (hasPrefix(source)) return fromPrefix(source);
  return fromOptions(source);
}

function fromPrefix(source: Extract<SettingsSource, { prefix: string }>): Settings {
  let config;
  try {
    config = defineConfig({
      prefix: source.prefix,
      variables: {
        appUrl: url({ name: 'URL', required: true }),
        coreUrl: url({ name: 'CORE_URL', required: true, origin: true }),
        clientId: string({ name: 'CORE_CLIENT_ID', required: true }),
        clientSecret: secret({ name: 'CORE_CLIENT_SECRET', required: true }),
      },
    });
  } catch (error) {
    // The prefix itself is wrong.
    throw new ConfigurationError(
      error instanceof Error ? error.message : 'The prefix cannot be used.',
    );
  }
  try {
    const env =
      source.env ??
      (globalThis as { process?: { env: Record<string, string> } }).process?.env ??
      {};
    const values = config.load(env, source.readFile ? { readFile: source.readFile } : {});
    return checked({
      appUrl: values.appUrl,
      coreUrl: values.coreUrl,
      clientId: values.clientId,
      clientSecret: values.clientSecret.reveal(),
    });
  } catch (error) {
    if (error instanceof ConfigError) throw new ConfigurationError(error.message);
    throw error;
  }
}

function fromOptions(source: {
  appUrl: string;
  coreUrl: string;
  clientId: string;
  clientSecret: string;
}): Settings {
  const given = {
    appUrl: source.appUrl,
    coreUrl: source.coreUrl,
    clientId: source.clientId,
    clientSecret: source.clientSecret,
  };
  const problems: string[] = [];
  for (const [name, value] of Object.entries(given)) {
    if (typeof value !== 'string' || value.trim() === '') problems.push(`${name} is required`);
  }
  if (problems.length > 0) throw problemsOf(problems);
  return checked(given);
}

/** The addresses are `http(s)` and core's has no path; anything else is named, not echoed. */
function checked(settings: Settings): Settings {
  const problems: string[] = [];
  const origin = (name: string, value: string, bare: boolean): string => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        problems.push(`${name} must be an http or https address`);
      } else if (bare && (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '')) {
        problems.push(`${name} must have no path: it is the instance's own address`);
      }
      return bare ? parsed.origin : parsed.toString();
    } catch {
      problems.push(`${name} is not an address`);
      return value;
    }
  };
  const appUrl = origin('the app address', settings.appUrl, false);
  const coreUrl = origin('the core address', settings.coreUrl, true);
  if (settings.clientId.trim() === '') problems.push('the client id is required');
  if (settings.clientSecret.trim() === '') problems.push('the client secret is required');
  if (problems.length > 0) throw problemsOf(problems);
  return { appUrl, coreUrl, clientId: settings.clientId, clientSecret: settings.clientSecret };
}

function problemsOf(problems: string[]): ConfigurationError {
  return new ConfigurationError(
    `The Sovereign client is configured wrongly (${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}):\n${problems
      .map((problem) => `  - ${problem}`)
      .join('\n')}`,
  );
}
