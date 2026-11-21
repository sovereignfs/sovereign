/**
 * Runs once when the server starts. The app applies its own migrations before it takes a request (contracts/app-manifest.md §4), then
 * the sign-in's, which `@sovereignfs/auth` keeps under their own histories. Then it reads the push key, so a wrong one stops it here,
 * and starts sending waiting notifications.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { migrate } = await import('./lib/migrate');
    await migrate();
    const { migrateSignIn } = await import('./lib/sign-in');
    await migrateSignIn();
    const { startPushOutbox } = await import('./lib/push');
    startPushOutbox();
  }
}
