/**
 * Runs once when the server starts, before it takes a request. Core refuses to start
 * with a missing or weak secret (core-app §3.5, spec/env.md): the whole configuration
 * is read here and every problem is reported at once.
 */
export async function register(): Promise<void> {
  // The Node.js server only (not the Edge runtime), and not while `next build` collects pages.
  if (
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  ) {
    return;
  }
  const { validateConfigOrExit } = await import('./src/startup');
  validateConfigOrExit();
}
