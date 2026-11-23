import { jsonResponse } from '../../../../src/api/errors';
import { getLauncherApps } from '../../../../src/clients';
import { appsGuard, myApps } from '../../../../src/clients/apps-api';
import { getDatabase } from '../../../../src/database';
import { answer } from '../../../../src/directory/service';
import { getCapabilityMatrix } from '../../../../src/roles/matrix';

export const dynamic = 'force-dynamic';

/**
 * The apps the caller may open (`listMyApps` in the Core API contract, core-app §3.8), for an app's own launcher. A public route in
 * the proxy, since a call carries a token and no cookie, so it checks the person's token itself, first. The person is the token's,
 * never one the request names.
 */
export async function GET(request: Request): Promise<Response> {
  return answer(async () => {
    const principal = await appsGuard(request);
    return jsonResponse(
      await myApps(
        await getDatabase(),
        principal.userId,
        await getCapabilityMatrix(),
        getLauncherApps,
      ),
    );
  });
}
