import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, type TestDatabase } from '@sovereignfs/database/testing';
import { CORE_PORT, CORE_URL } from './env';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const standalone = path.join(root, 'apps/core/.next/standalone/apps/core');

/** The built server (`pnpm build`): the same traced server the Docker image runs. */
export function coreServer(): string {
  const server = path.join(standalone, 'server.js');
  if (!existsSync(server)) {
    throw new Error('Core is not built. Run `pnpm --filter @sovereignfs/core build` first.');
  }
  // Next leaves its static files out of the traced server; the image copies them in, and so does this.
  const statics = path.join(standalone, '.next/static');
  if (!existsSync(statics)) {
    cpSync(path.join(root, 'apps/core/.next/static'), statics, { recursive: true });
  }
  return server;
}

/** The variables that make core use the database a `TestDatabase` made: the dialect's own, as the operator gives them. */
export function databaseEnvironment(database: TestDatabase): Record<string, string> {
  const { resolved } = database;
  const reveal = (url: unknown) =>
    typeof url === 'string' ? url : (url as { reveal(): string }).reveal();
  switch (resolved.dialect) {
    case 'sqlite':
      return { SV_DB_DIALECT: 'sqlite', SV_SQLITE_URL: reveal(resolved.url) };
    case 'sqld':
      return {
        SV_DB_DIALECT: 'sqld',
        SV_SQLD_URL: reveal(resolved.url),
        SV_SQLD_ADMIN_URL: String(resolved.adminUrl),
        SV_SQLD_NAMESPACE: String(resolved.namespace),
      };
    default:
      return { SV_DB_DIALECT: 'postgres', SV_POSTGRES_URL: reveal(resolved.url) };
  }
}

/** What core is given: nothing but the documented variables, so the run proves they are enough. */
export function coreEnvironment(
  database: TestDatabase,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    NODE_ENV: 'production',
    PORT: String(CORE_PORT),
    HOSTNAME: '127.0.0.1',
    SV_URL: CORE_URL,
    SV_AUTH_SECRET: randomBytes(48).toString('base64'),
    SV_FIELD_ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
    // No mail goes anywhere in the suite, so nothing can wait for a verification link.
    SV_AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
    ...databaseEnvironment(database),
    ...extra,
  };
}

export type RunningCore = {
  process: ChildProcess;
  output: () => string;
  stop: () => Promise<void>;
};

export async function startCore(environment: Record<string, string>): Promise<RunningCore> {
  const lines: string[] = [];
  const child = spawn('node', [coreServer()], {
    cwd: standalone,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk: Buffer) => lines.push(String(chunk)));
  child.stderr?.on('data', (chunk: Buffer) => lines.push(String(chunk)));
  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    });
  return { process: child, output: () => lines.join(''), stop };
}

export async function waitForHealth(core: RunningCore, timeoutMs = 60_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (core.process.exitCode !== null) {
      throw new Error(`core exited with ${core.process.exitCode}:\n${core.output()}`);
    }
    try {
      const reply = await fetch(`${CORE_URL}/api/health`);
      if (reply.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`core did not become healthy:\n${core.output()}`);
}

export { createTestDatabase };
