/** Runs once when the server starts. The app applies its own migrations before it takes a request (spec/app-manifest.md §4). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { migrate } = await import('./lib/migrate');
    await migrate();
  }
}
