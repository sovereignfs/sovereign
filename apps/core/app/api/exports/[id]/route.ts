import {
  authorizationResponse,
  requireCapability,
  requireSameOrigin,
} from '../../../../src/auth/authorize';
import { downloadExport } from '@sovereignfs/export';
import { coreFilesRoot } from '../../../../src/files';
import { exportsFolder } from '../../../../src/exports/make';
import { getExportJobs } from '../../../../src/exports/service';

export const dynamic = 'force-dynamic';

/**
 * Hands over an export once (core-app §4.7.3): a `POST` from core's own page, by the session that asked for it, within the hour. The
 * owner's needs `instance:export`; a person's, `profile:manage` and their own. Anything else, or a second time, is not there. The file is
 * removed once it has been sent.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    const kind =
      new URL(request.url).searchParams.get('kind') === 'instance' ? 'instance' : 'person';
    const session = await requireCapability(
      kind === 'instance' ? 'instance:export' : 'profile:manage',
    );
    const answer = await downloadExport({
      jobs: await getExportJobs(),
      folder: exportsFolder(coreFilesRoot()),
      id,
      kind,
      ...(kind === 'person' ? { sub: session.user.id } : {}),
      sessionId: session.session.id,
      host: new URL(request.url).hostname,
    });
    return (
      answer ?? new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
    );
  } catch (error) {
    return authorizationResponse(error) ?? Promise.reject(error);
  }
}
