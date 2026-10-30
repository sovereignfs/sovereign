import { bodyOf } from '../../../../src/api/body';
import { getActivityService } from '../../../../src/activity';
import { activityGuard, apiErrorOf } from '../../../../src/activity/api';
import type { RecordInput } from '../../../../src/activity/service';
import { answer } from '../../../../src/directory/service';

export const dynamic = 'force-dynamic';

const FIELDS = ['to', 'summary', 'link', 'at', 'key'] as const;

/**
 * Records something about a person (`logActivity` in the Core API contract, core-app §4.3). Made with an app's own token. The answer
 * is `202` with an id whether or not the person may have it, so it says nothing of the person. There is no way to read it back: the
 * person reads it in core.
 */
export async function POST(request: Request): Promise<Response> {
  return answer(async () => {
    const app = await activityGuard(request);
    const body = await bodyOf(request, FIELDS);
    try {
      const recorded = await (await getActivityService()).record(app.clientId, body as RecordInput);
      return Response.json(recorded, {
        status: 202,
        headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      });
    } catch (error) {
      throw apiErrorOf(error);
    }
  });
}
