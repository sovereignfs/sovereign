import { sdk } from '@sovereignfs/sdk';
import type { ConnectionRef } from '@sovereignfs/sdk';

/**
 * A user's personal git backup destination (workstream 0023 leg 2). Reuses
 * existing platform mechanisms rather than a new plugin-owned table, mirroring
 * `plugins/warden/app/_lib/providers.ts`'s own precedent for this exact shape:
 *
 * - `sdk.connections` (RFC 0049) holds the record — label, repo URL, branch,
 *   auth type, the age recipient (public key, not a secret), and health
 *   tracking (`status`/`lastError`/`lastCheckedAt`).
 * - `sdk.secrets` (RFC 0043) holds the actual git credential (an HTTPS access
 *   token or an SSH private key). `backup-destinations.ts` never stores the
 *   credential itself — only the `secretRef` id `sdk.connections` carries.
 *
 * No push logic here — that's workstream 0023 leg 3. This module only makes a
 * destination configurable.
 */
const PROVIDER_KIND = 'git.custom';

export type BackupDestinationAuthType = 'https-token' | 'ssh-key';

export interface BackupDestinationView {
  id: string;
  label: string;
  repoUrl: string;
  branch: string;
  authType: BackupDestinationAuthType;
  ageRecipient: string;
  status: ConnectionRef['status'];
  lastError: string | null;
  lastCheckedAt: number | null;
}

interface BackupDestinationMetadata {
  repoUrl?: unknown;
  branch?: unknown;
  authType?: unknown;
  ageRecipient?: unknown;
}

function isAuthType(value: unknown): value is BackupDestinationAuthType {
  return value === 'https-token' || value === 'ssh-key';
}

function toView(ref: ConnectionRef): BackupDestinationView {
  const metadata = (ref.metadata ?? {}) as BackupDestinationMetadata;
  return {
    id: ref.id,
    label: ref.label,
    repoUrl: typeof metadata.repoUrl === 'string' ? metadata.repoUrl : '',
    branch: typeof metadata.branch === 'string' ? metadata.branch : '',
    authType: isAuthType(metadata.authType) ? metadata.authType : 'https-token',
    ageRecipient: typeof metadata.ageRecipient === 'string' ? metadata.ageRecipient : '',
    status: ref.status,
    lastError: ref.lastError?.message ?? null,
    lastCheckedAt: ref.lastCheckedAt,
  };
}

export async function listBackupDestinations(): Promise<BackupDestinationView[]> {
  const refs = await sdk.connections.list({ provider: PROVIDER_KIND, scope: 'user' });
  return refs.map(toView);
}

export async function createBackupDestination(input: {
  label: string;
  repoUrl: string;
  branch: string;
  authType: BackupDestinationAuthType;
  credential: string;
  ageRecipient: string;
}): Promise<BackupDestinationView> {
  const secret = await sdk.secrets.create({
    scope: 'user',
    label: `Backup destination: ${input.label}`,
    value: input.credential,
  });
  const ref = await sdk.connections.create({
    scope: 'user',
    provider: PROVIDER_KIND,
    label: input.label,
    secretRef: secret.id,
    metadata: {
      repoUrl: input.repoUrl,
      branch: input.branch,
      authType: input.authType,
      ageRecipient: input.ageRecipient,
    },
  });
  return toView(ref);
}
