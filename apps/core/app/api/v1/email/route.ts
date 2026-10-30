import { bodyOf } from '../../../../src/api/body';
import { answer } from '../../../../src/directory/service';
import { getMailForAppsService } from '../../../../src/mail';
import { apiErrorOf, emailGuard } from '../../../../src/mail/api';
import type { EmailInput } from '../../../../src/mail/apps';

export const dynamic = 'force-dynamic';

const FIELDS = ['to', 'subject', 'body', 'link', 'key'] as const;

/**
 * Emails a person for an app (`sendEmail` in the Core API contract, core-app §4.2). Made with an app's own token. The answer is
 * `202` with an id whether or not the person may receive it, so it says nothing of the person or their address; an instance with no
 * mail does not have the operation, and answers `404`.
 */
export async function POST(request: Request): Promise<Response> {
  return answer(async () => {
    const app = await emailGuard(request);
    const body = await bodyOf(request, FIELDS);
    try {
      const sent = await (await getMailForAppsService()).send(app.clientId, body as EmailInput);
      return Response.json(sent, {
        status: 202,
        headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      });
    } catch (error) {
      throw apiErrorOf(error);
    }
  });
}
