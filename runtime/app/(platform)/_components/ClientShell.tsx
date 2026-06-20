'use client';

import { ToastProvider } from '@sovereignfs/ui';

/** Wraps the shell in client providers (ToastProvider for RFC 0015). */
export function ClientShell({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
