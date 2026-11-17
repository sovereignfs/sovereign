import { jsonResponse } from '../../../../../src/api/errors';
import { getDatabase } from '../../../../../src/database';
import { answer } from '../../../../../src/directory/service';
import { keysGuard, myKeys } from '../../../../../src/keys/api';

export const dynamic = 'force-dynamic';

/**
 * The caller's own keys for this app (`getMyKeys` in the Core API contract, core-app §5.7). A public route in the proxy, since a call
 * carries a token and no cookie, so it asks for the `keys` scope itself, first. The app is the token's, never one the request names.
 */
export async function GET(request: Request): Promise<Response> {
  return answer(async () => {
    const principal = await keysGuard(request);
    return jsonResponse(await myKeys(await getDatabase(), principal.userId, principal.clientId));
  });
}
