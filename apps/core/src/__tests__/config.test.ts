import { ConfigError } from '@sovereignfs/config';
import { describe, expect, it } from 'vitest';
import { config } from '../config';

const SECRET = 'a-secret-that-is-long-enough-to-pass-validation';
const GOOD = { SV_URL: 'https://core.sovereign.local', SV_AUTH_SECRET: SECRET };

function problems(env: Record<string, string>, readFile?: (path: string) => string): string[] {
  try {
    config.load(env, { readFile });
  } catch (error) {
    if (error instanceof ConfigError)
      return error.problems.map((p) => `${p.variable} ${p.message}`);
    throw error;
  }
  return [];
}

describe("core's configuration", () => {
  it('loads when the address and the secret are set', () => {
    const loaded = config.load(GOOD);
    expect(loaded.url).toBe('https://core.sovereign.local');
    expect(loaded.authSecret.reveal()).toBe(SECRET);
  });

  it('reports every missing required variable at once', () => {
    expect(problems({})).toEqual([
      'SV_URL is required but not set',
      'SV_AUTH_SECRET is required but not set (or set SV_AUTH_SECRET_FILE)',
    ]);
  });

  it('refuses a secret shorter than 32 characters, without showing it', () => {
    const short = 'short-secret';
    const found = problems({ ...GOOD, SV_AUTH_SECRET: short });
    expect(found).toEqual(['SV_AUTH_SECRET must be at least 32 characters']);
    expect(found.join(' ')).not.toContain(short);
  });

  it('refuses an address with a path', () => {
    expect(problems({ ...GOOD, SV_URL: 'https://core.sovereign.local/app' })).toEqual([
      'SV_URL must be an address with no path, query or fragment',
    ]);
  });

  it('reads the secret from the file SV_AUTH_SECRET_FILE names', () => {
    const loaded = config.load(
      { SV_URL: GOOD.SV_URL, SV_AUTH_SECRET_FILE: '/run/secrets/auth' },
      { readFile: () => `${SECRET}\n` },
    );
    expect(loaded.authSecret.reveal()).toBe(SECRET);
  });

  it('refuses the secret given both directly and as a file', () => {
    expect(problems({ ...GOOD, SV_AUTH_SECRET_FILE: '/run/secrets/auth' })).toEqual([
      'SV_AUTH_SECRET is set together with SV_AUTH_SECRET_FILE; set only one',
    ]);
  });

  it('never prints the secret when it is logged', () => {
    const loaded = config.load(GOOD);
    expect(JSON.stringify(loaded)).not.toContain(SECRET);
    expect(String(loaded.authSecret)).not.toContain(SECRET);
  });

  describe('what the instance is for', () => {
    it('is production when it is not set, so nothing is permitted by leaving it out', () => {
      expect(config.load(GOOD).environment).toBe('production');
    });

    it.each(['development', 'staging', 'production'])('accepts %s', (value) => {
      expect(config.load({ ...GOOD, SV_ENVIRONMENT: value }).environment).toBe(value);
    });

    it('stops core on any other value, naming the three, so a misspelling is never a permission', () => {
      for (const value of ['Development', 'dev', 'prod', 'test', 'stage']) {
        expect(problems({ ...GOOD, SV_ENVIRONMENT: value }), value).toEqual([
          'SV_ENVIRONMENT must be one of: development, staging, production',
        ]);
      }
    });
  });
});
