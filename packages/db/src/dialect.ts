export type Dialect = 'sqlite' | 'postgres';

export type ResolvedDialect = { dialect: 'postgres'; url: string } | { dialect: 'sqlite' };

/**
 * Resolve the database dialect from the environment. `DB_DIALECT` is the
 * **sole** source of truth — mandatory, no inference, no default. Postgres
 * additionally requires `POSTGRES_DB_URL`; SQLite needs nothing here (it's
 * always sqld-backed — see `sqld.ts`'s `SQLD_URL`/`SQLD_ADMIN_URL`, resolved
 * independently).
 *
 * Previously the dialect could be inferred from `DATABASE_URL`'s scheme, and
 * SQLite could fall back to a plain on-disk file. Both are retired: every
 * deployment must now say explicitly which dialect it runs, and SQLite has no
 * file-based fallback left to infer toward.
 */
export function resolveDialect(env: NodeJS.ProcessEnv = process.env): ResolvedDialect {
  const explicit = env.DB_DIALECT?.toLowerCase();
  if (explicit !== 'sqlite' && explicit !== 'postgres') {
    throw new Error(
      `DB_DIALECT is required and must be "sqlite" or "postgres" (got ${
        explicit === undefined || explicit.length === 0 ? 'unset' : `"${explicit}"`
      }).`,
    );
  }

  if (explicit === 'sqlite') return { dialect: 'sqlite' };

  const url = env.POSTGRES_DB_URL;
  if (!url) {
    throw new Error('DB_DIALECT=postgres requires POSTGRES_DB_URL to be set.');
  }
  return { dialect: 'postgres', url };
}
