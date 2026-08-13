/**
 * The public base URL of this Sovereign instance, resolved at REQUEST time.
 *
 * Read via a computed key — NOT the literal `process.env.NEXT_PUBLIC_RUNTIME_URL`
 * — on purpose. Next.js inlines literal `process.env.NEXT_PUBLIC_*` accesses at
 * BUILD time into every bundle. The Docker image is built without an `.env`
 * (it is `.dockerignore`d), so a literal read would freeze to the
 * `localhost:3000` fallback regardless of what's injected at container start.
 * A computed property access is a genuine runtime lookup instead. Mirrors
 * `apps/auth/src/runtime-url.ts`'s identical trick for the same reason.
 */
export function instancePublicUrl(): string {
  const key = 'NEXT_PUBLIC_RUNTIME_URL';
  return process.env[key] ?? `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
}
