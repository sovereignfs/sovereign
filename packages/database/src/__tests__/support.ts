import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@sovereignfs/config';
import pg from 'pg';
import {
  connect,
  createNamespace,
  databaseVariables,
  dropNamespace,
  resolveDatabase,
} from '../index.js';
import type { Database, ResolvedDatabase } from '../index.js';

/**
 * What a `*.db.test.ts` file runs against: the database the CI leg started, chosen with
 * SV_DB_DIALECT and its URL variables, exactly as core would read them. Every test file
 * gets a private namespace, file or schema, so files can run in parallel on one server.
 */
export const dialect = process.env.SV_DB_DIALECT;

const loadSettings = defineConfig({ prefix: 'SV', variables: databaseVariables });

const unique = () => randomBytes(4).toString('hex');

export type TestDatabase = {
  resolved: ResolvedDatabase;
  /** Opens another connection to the same private database. */
  open(): Promise<Database>;
  cleanup(): Promise<void>;
};

export async function createTestDatabase(): Promise<TestDatabase> {
  const resolved = resolveDatabase(loadSettings.load(), { prefix: 'SV', required: true });
  const name = `t_${unique()}`;

  if (resolved.dialect === 'sqlite') {
    const folder = mkdtempSync(path.join(tmpdir(), 'sv-db-'));
    const file = path.join(folder, `${name}.db`);
    const own: ResolvedDatabase = { dialect: 'sqlite', url: `file:${file}`, path: file };
    return {
      resolved: own,
      open: () => connect(own),
      cleanup: async () => rmSync(folder, { recursive: true, force: true }),
    };
  }

  if (resolved.dialect === 'sqld') {
    if (resolved.adminUrl === undefined) throw new Error('The sqld leg needs SV_SQLD_ADMIN_URL.');
    const own: ResolvedDatabase = { ...resolved, namespace: name };
    await createNamespace(resolved.adminUrl, name);
    return {
      resolved: own,
      open: () => connect(own),
      cleanup: async () => {
        await dropNamespace(resolved.adminUrl as string, name).catch(() => undefined);
      },
    };
  }

  // PostgreSQL: a schema of its own, found through the connection's search_path.
  const admin = new pg.Client({ connectionString: resolved.url.reveal() });
  await admin.connect();
  await admin.query(`create schema ${name}`);
  const scoped = new URL(resolved.url.reveal());
  scoped.searchParams.set('options', `-c search_path=${name}`);
  const own: ResolvedDatabase = {
    ...resolved,
    url: new (await import('@sovereignfs/config')).Secret(scoped.toString()),
  };
  return {
    resolved: own,
    open: () => connect(own),
    cleanup: async () => {
      await admin.query(`drop schema if exists ${name} cascade`).catch(() => undefined);
      await admin.end();
    },
  };
}
