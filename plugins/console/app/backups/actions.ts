'use server';

import { sdk } from '@sovereignfs/sdk';

const RUNTIME_URL = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;

export type TriggerResult = { ok: true; jobId: string } | { ok: false; error: string };

export interface BackupJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  sizeBytes: number;
  errorMessage: string | null;
  downloadUrl: string | null;
  pushStatus: 'succeeded' | 'failed' | null;
  pushError: string | null;
}

/**
 * Every action in this file independently re-checks session + capability —
 * the Console page's `adminOnly` gate (manifest + middleware) never covers a
 * Server Action, which is reachable by action id on its own
 * (`docs/architecture-rules.md`'s server-action-authorization rule). Beyond
 * that session check, the actual mutation goes through
 * `/api/admin/backup-jobs*` with `SOVEREIGN_ADMIN_KEY` attached — Console
 * cannot import `@sovereignfs/db` directly (SDK boundary ESLint rule, which
 * still applies to Console for `@sovereignfs/db`/`manifest`/`mailer` even
 * though the `runtime/src` restriction is lifted for it).
 */
async function requireInstanceBackup(): Promise<void> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'instance:backup')) {
    throw new Error('Insufficient privileges to back up this instance.');
  }
}

export async function triggerInstanceBackupAction(
  _prev: TriggerResult | null,
  formData: FormData,
): Promise<TriggerResult> {
  try {
    await requireInstanceBackup();
  } catch (err) {
    // Caught and returned, not left to propagate: an uncaught throw from a
    // `useActionState` action surfaces to the client as an opaque error
    // digest, not this message — see `email-templates-actions.ts`'s own
    // fixed version of this exact gap for the precedent.
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const passphrase = (formData.get('passphrase') as string | null)?.trim();
  if (!passphrase) return { ok: false, error: 'A passphrase is required.' };

  const excludePlugins = formData.getAll('excludePlugins').map(String);
  const pushToGit = formData.get('pushToGit') === 'on';

  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  let res: Response;
  try {
    res = await fetch(`${RUNTIME_URL}/api/admin/backup-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminKey}` },
      body: JSON.stringify({ passphrase, excludePlugins, pushToGit }),
    });
  } catch {
    return { ok: false, error: 'Failed to reach the runtime API.' };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? `API error ${res.status}.` };
  }
  const data = (await res.json()) as { jobId: string };
  return { ok: true, jobId: data.jobId };
}

/** Called from a client-side poll loop, not a form — a plain function, not `useActionState`. */
export async function getInstanceBackupJobStatusAction(jobId: string): Promise<BackupJobStatus> {
  await requireInstanceBackup();

  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${RUNTIME_URL}/api/admin/backup-jobs/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch backup job status: ${res.status}`);
  return (await res.json()) as BackupJobStatus;
}
