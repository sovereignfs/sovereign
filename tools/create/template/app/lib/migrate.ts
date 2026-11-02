import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { directDb } from './db';

/**
 * Applies the files in `migrations/`, in name order, each once (contracts/app-manifest.md §4: an app applies its own migrations when it
 * starts, and is safe to start again). One advisory lock holds a second copy of the app back until the first has finished. It is a session
 * lock, and a session is one connection, so all of it runs on the direct address, never behind a pooler.
 */
export async function migrate(): Promise<void> {
  const client = await directDb().connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['__NAME__-migrations']);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (row) => row.name,
      ),
    );
    const folder = path.join(process.cwd(), 'migrations');
    for (const file of readdirSync(folder)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(path.join(folder, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `The migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    await client
      .query('SELECT pg_advisory_unlock(hashtext($1))', ['__NAME__-migrations'])
      .catch(() => undefined);
    client.release();
  }
}
