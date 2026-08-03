import { notFound } from 'next/navigation';

/**
 * Middleware rewrite target for the `decidePluginRoute` "not-found" decision
 * (runtime/middleware.ts) — calling `notFound()` here guarantees a true 404
 * status and renders the nearest `not-found.tsx` boundary, which a bare
 * `NextResponse(..., { status: 404 })` can't do for a page navigation.
 */
export default function NotFoundMarker(): never {
  notFound();
}
