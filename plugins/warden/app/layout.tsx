import type { ReactNode } from 'react';
import { registerPortability } from './_lib/portability';

/**
 * Registration is best-effort and idempotent (RFC 0007, epic task 22.5) —
 * a failure here must not block the chat UI itself.
 *
 * Fired without awaiting, deliberately — this layout is an *ancestor* of
 * `app/loading.tsx`'s Suspense boundary, not a descendant of it. Every route
 * under this plugin renders through this layout first, so an `await` here
 * (even a fast one) sits above the streaming boundary that the rest of the
 * launch-performance fix depends on: nothing below — not even the loading
 * fallback — can flush to the browser until this function returns. That
 * silently defeated the whole point of streaming the shell, on every single
 * click into Warden, regardless of how quickly `registerPortability()`
 * itself resolves. It has no return value the render path needs and no
 * meaningful failure mode users can act on, so there is nothing to wait for.
 */
export default function WardenLayout({ children }: { children: ReactNode }) {
  void registerPortability().catch(() => {
    // Best-effort platform integration.
  });
  return children;
}
