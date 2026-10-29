import { ApiError, invalidRequest, jsonResponse } from '../../../../../../src/api/errors';
import { getConfig } from '../../../../../../src/config';
import { getDatabase } from '../../../../../../src/database';
import { findUserByEmail } from '../../../../../../src/directory/directory';
import { answer, directoryGuard } from '../../../../../../src/directory/service';

export const dynamic = 'force-dynamic';

/**
 * Finds one person by their whole email address (`findDirectoryUserByEmail` in the Core API contract). Only an exact
 * match of the whole address finds anybody; see the search route for who may call it.
 */
export async function GET(request: Request): Promise<Response> {
  return answer(async () => {
    await directoryGuard(request);
    const email = (new URL(request.url).searchParams.get('email') ?? '').trim();
    if (email.length < 3 || email.length > 254) {
      throw invalidRequest('email must be a whole email address, 3 to 254 characters.');
    }
    const user = await findUserByEmail(await getDatabase(), email, getConfig().url);
    if (!user) throw new ApiError(404, 'not_found', 'There is no one with that email address.');
    return jsonResponse(user);
  });
}
