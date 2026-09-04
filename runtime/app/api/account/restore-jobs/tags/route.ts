import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID, getPluginConnection, getPluginSecret } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { listBackupTags, type GitPushAuthType } from '@/src/git-backup';
import { decryptSecretValue } from '@/src/secrets';

// Matches plugins/account/app/_lib/backup-destinations.ts's PROVIDER_KIND
// owner — backup destinations are always created under the account plugin's
// own id, regardless of which route later reads them back.
const BACKUP_DESTINATION_PLUGIN_ID = 'fs.sovereign.account';

interface BackupDestinationMetadata {
  repoUrl?: unknown;
  authType?: unknown;
}

/**
 * List the `sv-backup/*` tags on a connected git destination (workstream
 * 0023 leg 4, epic 8.40). Synchronous — a plain `git ls-remote --tags`, no
 * job needed, matching RFC 0064's own "listing is sync" design.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const destinationId = new URL(request.url).searchParams.get('destinationId');
  if (!destinationId) {
    return NextResponse.json({ error: 'destinationId is required' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  const context = { tenantId: DEFAULT_TENANT_ID, pluginId: BACKUP_DESTINATION_PLUGIN_ID, userId };
  const connection = await getPluginConnection(pdb, destinationId, context);
  if (!connection || !connection.secretRef) {
    return NextResponse.json({ error: 'Backup destination not found.' }, { status: 404 });
  }

  const metadata = (
    connection.metadata ? (JSON.parse(connection.metadata) as BackupDestinationMetadata) : {}
  ) as BackupDestinationMetadata;
  const repoUrl = typeof metadata.repoUrl === 'string' ? metadata.repoUrl : '';
  const authType: GitPushAuthType = metadata.authType === 'ssh-key' ? 'ssh-key' : 'https-token';
  if (!repoUrl) {
    return NextResponse.json({ error: 'Backup destination is misconfigured.' }, { status: 400 });
  }

  const secretRow = await getPluginSecret(pdb, connection.secretRef, context);
  if (!secretRow) {
    return NextResponse.json(
      { error: 'Backup destination credential could not be read.' },
      { status: 400 },
    );
  }
  const credential = decryptSecretValue(secretRow.ciphertext, {
    tenantId: context.tenantId,
    pluginId: context.pluginId,
    scope: secretRow.scope,
    userId: context.userId,
  });

  try {
    const tags = await listBackupTags({ repoUrl, authType, credential });
    return NextResponse.json({
      tags: tags.map((t) => ({
        tag: t.tag,
        timestamp: t.timestamp.toISOString(),
        platformVersion: t.platformVersion,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not list backups.' },
      { status: 502 },
    );
  }
}
