import { invalidRequest, jsonResponse } from '../../../../../../src/api/errors';
import { getDatabase } from '../../../../../../src/database';
import { answer } from '../../../../../../src/directory/service';
import { keysGuard, personKeys } from '../../../../../../src/keys/api';

export const dynamic = 'force-dynamic';

/** Another person's public keys for this app (`getPersonKeys` in the Core API contract); see `/api/v1/keys/me`. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sub: string }> },
): Promise<Response> {
  return answer(async () => {
    const principal = await keysGuard(request);
    const { sub } = await params;
    if (sub.length < 1 || sub.length > 255)
      throw invalidRequest('sub must be 1 to 255 characters.');
    return jsonResponse(await personKeys(await getDatabase(), sub, principal.clientId));
  });
}
