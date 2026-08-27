import type { ReactNode } from 'react';
import { registerPortability } from './_lib/portability';

/**
 * Registration is best-effort and idempotent (RFC 0007, epic task 22.5) —
 * a failure here must not block the chat UI itself.
 */
export default async function WardenLayout({ children }: { children: ReactNode }) {
  try {
    await registerPortability();
  } catch {
    // Best-effort platform integration.
  }
  return children;
}
