/**
 * The browser-facing URL of the runtime, resolved at REQUEST time.
 *
 * Read via a computed key — NOT the literal `process.env.NEXT_PUBLIC_RUNTIME_URL`
 * — on purpose. Next.js inlines literal `process.env.NEXT_PUBLIC_*` accesses at
 * BUILD time into every bundle (client and server). The Docker image is built
 * without an `.env` (it is `.dockerignore`d), so a literal read freezes to the
 * `localhost:3000` fallback and ignores the env injected at container start —
 * sending users to the wrong origin after login (e.g. :3000 instead of the
 * prod :4000, or the real public domain). A computed property access is left as
 * a genuine runtime lookup, so the value tracks the deployment's actual config.
 *
 * Call only from server code (server component or route handler). `apps/auth`
 * forces dynamic rendering, so this is evaluated per request.
 */
export function runtimePublicUrl(): string {
  const key = 'NEXT_PUBLIC_RUNTIME_URL';
  return process.env[key] ?? `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
}
