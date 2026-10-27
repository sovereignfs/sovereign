import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'a-secret-that-is-long-enough-to-pass-validation';

async function start(env: Record<string, string>) {
  vi.resetModules();
  for (const name of Object.keys(process.env).filter((n) => n.startsWith('SV_')))
    vi.stubEnv(name, '');
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { validateConfigOrExit } = await import('../startup');
  let exited = false;
  try {
    validateConfigOrExit();
  } catch (thrown) {
    if (!(thrown instanceof Error) || thrown.message !== 'process.exit') throw thrown;
    exited = true;
  }
  return {
    exited,
    code: exit.mock.calls[0]?.[0],
    printed: error.mock.calls.map((c) => String(c[0])).join('\n'),
  };
}

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('start-up validation', () => {
  const good = { SV_URL: 'http://localhost:3000', SV_AUTH_SECRET: SECRET };

  it('starts with the address and the secret, and no database', async () => {
    expect((await start(good)).exited).toBe(false);
  });

  it('stops with exit code 1 and names what is missing', async () => {
    const result = await start({});
    expect(result.exited).toBe(true);
    expect(result.code).toBe(1);
    expect(result.printed).toContain('SV_URL is required');
    expect(result.printed).toContain('SV_AUTH_SECRET is required');
  });

  it('stops when a dialect is chosen and its address is missing', async () => {
    const result = await start({ ...good, SV_DB_DIALECT: 'postgres' });
    expect(result.exited).toBe(true);
    expect(result.printed).toContain('SV_POSTGRES_URL is required when DB_DIALECT is postgres');
  });

  it('starts with a complete database setting', async () => {
    expect(
      (await start({ ...good, SV_DB_DIALECT: 'sqlite', SV_SQLITE_URL: 'file:./data/core.db' }))
        .exited,
    ).toBe(false);
  });

  it('starts with a valid key ring, or none', async () => {
    const ring = `k1:${Buffer.alloc(32, 7).toString('base64')}`;
    expect((await start({ ...good, SV_FIELD_ENCRYPTION_KEYS: ring })).exited).toBe(false);
  });

  it('stops when the key ring is set and wrong, even though none is required yet', async () => {
    const result = await start({ ...good, SV_FIELD_ENCRYPTION_KEYS: 'k1:tooshort,k1:alsobad' });
    expect(result.exited).toBe(true);
    expect(result.printed).toContain(
      'SV_FIELD_ENCRYPTION_KEYS entry 1 has a key that is not 32 bytes',
    );
  });

  it('never prints a key from a bad ring', async () => {
    const key = Buffer.alloc(32, 9).toString('base64');
    const result = await start({ ...good, SV_FIELD_ENCRYPTION_KEYS: `K1:${key}` });
    expect(result.exited).toBe(true);
    expect(result.printed).not.toContain(key);
  });

  it('never prints the secret or a database password', async () => {
    const result = await start({
      SV_URL: 'http://localhost:3000',
      SV_AUTH_SECRET: 'too-short-secret',
      SV_DB_DIALECT: 'postgres',
      SV_POSTGRES_URL: 'mysql://core:hunter2@db/core',
    });
    expect(result.printed).not.toContain('too-short-secret');
    expect(result.printed).not.toContain('hunter2');
  });
});
