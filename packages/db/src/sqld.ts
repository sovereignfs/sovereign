import { createClient, type Client } from '@libsql/client';

/**
 * sqld (libSQL server) connectivity — workstream 0009 leg 3, RFC 0091.
 *
 * Deliberately independent of `dialect.ts`'s `DB_DIALECT`/`DATABASE_URL`:
 * the RFC 0091 encryption carve-out means a single process can have *both*
 * plain-file SQLite (encrypted databases) and sqld-backed SQLite (everything
 * else) open at once, so one pair of env vars can't serve both. `DB_DIALECT`
 * stays exactly `'sqlite' | 'postgres'` — no third literal — and these vars
 * only matter for the parts of the `'sqlite'` dialect the carve-out routes to
 * sqld.
 */

const DEFAULT_SQLD_URL = 'http://sqld:8080';
const DEFAULT_SQLD_ADMIN_URL = 'http://sqld:8081';

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
