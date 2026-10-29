import { invalidRequest, jsonResponse } from '../../../../../src/api/errors';
import { getConfig } from '../../../../../src/config';
import { getDatabase } from '../../../../../src/database';
import { searchUsers } from '../../../../../src/directory/directory';
import { answer, directoryGuard } from '../../../../../src/directory/service';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MAX_QUERY = 100;

/** `limit`: a whole number from 1 to 25, or 10 when it is not given. */
function limitOf(value: string | null): number {
  if (value === null) return DEFAULT_LIMIT;
  const limit = /^[0-9]{1,3}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw invalidRequest(`limit must be a whole number from 1 to ${MAX_LIMIT}.`);
  }
  return limit;
}

/**
 * Searches for people by name (`searchDirectoryUsers` in the Core API contract). A public route in the proxy, since
 * a call carries a token and no cookie, and so it asks for the `directory` scope itself, first (core-app §3.9).
 */
export async function GET(request: Request): Promise<Response> {
  return answer(async () => {
    await directoryGuard(request);
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') ?? '').trim();
    if (query === '' || query.length > MAX_QUERY) {
      throw invalidRequest(`q must be 1 to ${MAX_QUERY} characters.`);
    }
    const users = await searchUsers(
      await getDatabase(),
      query,
      limitOf(url.searchParams.get('limit')),
      getConfig().url,
    );
    return jsonResponse({ users });
  });
}
