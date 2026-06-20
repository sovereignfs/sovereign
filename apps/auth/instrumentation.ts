/**
 * Runs once on server startup (not during build). Applies better-auth's schema
 * migrations so `pnpm dev` works with no separate migrate step. Guarded to the
 * Node.js runtime — migrations use better-sqlite3, which the edge runtime lacks.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runAuthMigrations } = await import('./src/migrate');
    await runAuthMigrations();

    // RFC 0021 — owner migration: promote the oldest platform:admin to
    // platform:owner if no owner exists yet (upgrading pre-0.21 instances).
    const { authGet, authRun } = await import('./src/db');
    const ownerRow = await authGet<{ id: string }>('SELECT id FROM "user" WHERE role = ? LIMIT 1', [
      'platform:owner',
    ]);
    if (!ownerRow) {
      const oldest = await authGet<{ id: string }>(
        'SELECT id FROM "user" WHERE role = ? ORDER BY "createdAt" ASC LIMIT 1',
        ['platform:admin'],
      );
      if (oldest) {
        const now = new Date().toISOString();
        await authRun('UPDATE "user" SET role = ?, "updatedAt" = ? WHERE id = ?', [
          'platform:owner',
          now,
          oldest.id,
        ]);
        console.log(`[sovereign] Migrated user ${oldest.id} to platform:owner (RFC 0021).`);
      }
    }
  }
}
