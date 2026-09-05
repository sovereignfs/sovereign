import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared between `scripts/next-server.mjs` (spawns the actual dev servers)
 * and `playwright.config.ts` (needs to know the *same* ports those servers
 * will actually bind to, to poll/navigate the right one). A local `.env`
 * `AUTH_PORT`/`RUNTIME_PORT` override must be visible to both call sites —
 * previously it was only read inside the spawned child process, so a
 * customized port silently desynced from the hardcoded URLs
 * `playwright.config.ts`'s `webServer`/`baseURL` polled, timing out waiting
 * for a server that was actually listening on a different port the whole
 * time.
 */

function parseEnvValue(raw) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Loads `.env` at `root` into `process.env`, without overwriting any key already set (matches dotenv's own precedence — real shell/CI env wins). */
export function loadRootEnv(root) {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;

    process.env[key] = parseEnvValue(trimmed.slice(eq + 1));
  }
}

// Where each app's Next.js project lives (relative to the repo root), and
// the env var + fallback port used when PORT itself isn't set either.
export const DEV_APPS = {
  auth: { cwd: ['apps', 'auth'], portEnv: 'AUTH_PORT', defaultPort: '3001' },
  runtime: { cwd: ['runtime'], portEnv: 'RUNTIME_PORT', defaultPort: '3000' },
  relay: { cwd: ['apps', 'relay'], portEnv: 'RELAY_PORT', defaultPort: '3002' },
  harness: { cwd: ['apps', 'harness'], portEnv: 'HARNESS_PORT', defaultPort: '3003' },
};

/** Resolve `app`'s dev-server port: its own env var, then PORT, then its documented default. Throws on an invalid value — callers decide how to surface that. */
export function resolveAppPort(app) {
  const raw = process.env[DEV_APPS[app].portEnv] ?? process.env.PORT ?? DEV_APPS[app].defaultPort;
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${app} port: ${raw}`);
  }

  return String(port);
}
