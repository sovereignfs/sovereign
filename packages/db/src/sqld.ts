import { createRequire } from 'node:module';
import type { Client } from '@libsql/client';

/**
 * sqld (libSQL server) connectivity — workstream 0009 leg 3, RFC 0091.
 *
 * Every SQLite-dialect database (platform, auth, every plugin) is sqld-backed
 * — no plain-file fallback. `SQLD_URL`/`SQLD_ADMIN_URL` are their own env
 * vars, separate from `dialect.ts`'s `DB_DIALECT`/`POSTGRES_DB_URL`, since
 * they're meaningful only on the `'sqlite'` branch and have sensible Docker
 * Compose defaults of their own.
 *
 * `@libsql/client` is required lazily (via `require`, not a top-level
 * `import`) — found the hard way in production: `runtime/instrumentation.ts`
 * unconditionally imports this package (via `sdk-host.ts`/`plugin-migrations.ts`
 * → `@sovereignfs/db`'s barrel export) on every boot, and Next.js's
 * instrumentation hook loads outside the webpack-bundled server graph, so the
 * `libsql: false` alias in `runtime/next.config.ts` never applies to it. A
 * top-level `import` here loaded `libsql`'s real native addon eagerly — on
 * every dialect, not just sqld — and crashed instantly on a musl (Alpine)
 * image with no matching prebuilt binary, regardless of whether the sqld path
 * was ever going to be taken. `apps/auth/src/db.ts` has the identical fix and
 * the same story, for the same reason (it duplicates this file's sqld glue
 * rather than importing it — see that file's own doc comment).
 */

const require = createRequire(import.meta.url);

// Defaults target native dev (scripts/ensure-sqld.ts starts sqld on these
// localhost ports — 28080/28081, not sqld's own internal 8080/8081, since
// 8080 is a commonly-squatted local dev port on a real developer machine).
// Docker Compose deployments don't rely on this default — docker-compose.yml
// /prod.yml set SQLD_URL/SQLD_ADMIN_URL to the internal service hostname
// (http://sqld:8080/8081) explicitly.
const DEFAULT_SQLD_URL = 'http://localhost:28080';
const DEFAULT_SQLD_ADMIN_URL = 'http://localhost:28081';

/** The sqld client-facing HTTP endpoint (Hrana-over-HTTP). */
export function sqldUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.SQLD_URL ?? DEFAULT_SQLD_URL;
}

/** sqld's separate admin API endpoint — namespace create/drop, not exposed to the host. */
export function sqldAdminUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.SQLD_ADMIN_URL ?? DEFAULT_SQLD_ADMIN_URL;
}

/**
 * Namespace name for an isolated plugin's sqld-backed database — the sqld
 * analogue of `pluginSchemaName` (Postgres). Same slug rules; sqld namespace
 * names accept the same character set.
 */
export function pluginNamespaceName(pluginId: string): string {
  return `plugin_${pluginId.replace(/[.-]/g, '_')}`;
}

/**
 * An `@libsql/client` `Client` targeting a specific namespace via the
 * `x-namespace` header — sqld's namespace-routing mechanism
 * (`libsql-server/src/http/user/db_factory.rs`'s `namespace_from_headers`;
 * verified empirically against a live `--enable-namespaces` instance: per-
 * namespace isolation holds, and the no-header default namespace is a third,
 * genuinely separate database). Omit `namespace` for the platform DB, which
 * uses sqld's own default namespace — no admin-API provisioning needed for
 * that one, unlike every named plugin namespace below.
 */
export function createSqldClient(url: string, namespace?: string): Client {
  const { createClient } = require('@libsql/client') as typeof import('@libsql/client');
  if (!namespace) return createClient({ url });
  return createClient({
    url,
    fetch: (input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('x-namespace', namespace);
      return fetch(input as string, { ...init, headers });
    },
  });
}

/**
 * Create an sqld namespace via the admin API (`provisionPluginDb`'s sqld
 * path). Idempotent: sqld responds `400 Namespace "<ns>" already exists` for
 * a namespace that's already there (verified live) — treated as success,
 * matching `provisionPluginDb`'s documented "safe to call multiple times".
 */
export async function provisionSqldNamespace(adminUrl: string, namespace: string): Promise<void> {
  const res = await fetch(`${adminUrl}/v1/namespaces/${namespace}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res.ok || res.status === 400) return;
  throw new Error(
    `Failed to create sqld namespace "${namespace}": ${res.status} ${await res.text()}`,
  );
}

/**
 * Drop an sqld namespace via the admin API (`dropPluginDb`'s sqld path).
 * `404 Namespace "<ns>" doesn't exist` (verified live) is treated as success
 * — the namespace was already gone, mirroring `dropPluginDb`'s existing
 * SQLite-file-deletion branch, which silently accepts an already-missing file.
 */
export async function dropSqldNamespace(adminUrl: string, namespace: string): Promise<void> {
  const res = await fetch(`${adminUrl}/v1/namespaces/${namespace}`, { method: 'DELETE' });
  if (res.ok || res.status === 404) return;
  throw new Error(
    `Failed to drop sqld namespace "${namespace}": ${res.status} ${await res.text()}`,
  );
}
