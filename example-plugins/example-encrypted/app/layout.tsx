import type { ReactNode } from 'react';
import { registerEncryptionTables, registerExport } from './_lib/data';

export default async function ExampleEncryptedLayout({ children }: { children: ReactNode }) {
  // Registration is best-effort and idempotent: classified tables (so the
  // operator's backfill/rotation tools can walk them) and the export
  // resolver (so exports emit plaintext). A failure must not block the UI.
  try {
    await registerEncryptionTables();
    await registerExport();
  } catch {
    // Best-effort platform integrations.
  }
  return children;
}
