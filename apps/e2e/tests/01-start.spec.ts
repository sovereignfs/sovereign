import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { startCore } from '../support/core';
import { CORE_URL } from '../support/env';
import { world } from '../support/world';

test('§3.17.1: a fresh instance has started from the documented variables, and reports itself and its database up', async ({
  request,
}) => {
  const reply = await request.get(`${CORE_URL}/api/health`);
  expect(reply.status()).toBe(200);
  expect(await reply.json()).toEqual({ status: 'ok', app: 'up', database: 'up' });
});

/** What core is given with one required variable left out. The rest are as the run's own core has them. */
const without = (missing: string) => ({
  PATH: process.env.PATH ?? '',
  NODE_ENV: 'production',
  PORT: '3198',
  HOSTNAME: '127.0.0.1',
  SV_URL: CORE_URL,
  SV_AUTH_SECRET: randomBytes(48).toString('base64'),
  ...world.get<Record<string, string>>('database'),
  [missing]: '',
});

for (const missing of ['SV_AUTH_SECRET', 'SV_URL']) {
  test(`§3.17.1: core refuses to start without ${missing}, and says so`, async () => {
    const core = await startCore(without(missing));
    try {
      const code = await new Promise<number | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 30_000);
        core.process.once('exit', (exitCode) => {
          clearTimeout(timer);
          resolve(exitCode);
        });
      });
      // It stopped by itself, with a failure, and named the variable: it never began to serve.
      expect(code).not.toBeNull();
      expect(code).not.toBe(0);
      expect(core.output()).toContain(missing);
    } finally {
      await core.stop();
    }
  });
}
