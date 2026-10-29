import { invalidRequest, jsonResponse } from '../../../../../../src/api/errors';
import { getConfig } from '../../../../../../src/config';
import { getDatabase } from '../../../../../../src/database';
import { resolveUsers } from '../../../../../../src/directory/directory';
import { answer, directoryGuard } from '../../../../../../src/directory/service';

export const dynamic = 'force-dynamic';

const MAX_SUBS = 100;
const MAX_SUB_LENGTH = 255;
const MAX_BODY_BYTES = 64 * 1024;

/** The `subs` of the request's body, or why the body is not what the contract allows. */
async function subsOf(request: Request): Promise<string[]> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw invalidRequest('That body is too large.');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw invalidRequest('That body is too large.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw invalidRequest('The body must be JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalidRequest('The body must be an object with a list of subs.');
  }
  const fields = Object.keys(body);
  if (fields.length !== 1 || fields[0] !== 'subs') {
    throw invalidRequest('The body has only `subs`.');
  }
  const { subs } = body as { subs: unknown };
  if (!Array.isArray(subs) || subs.length < 1 || subs.length > MAX_SUBS) {
    throw invalidRequest(`subs is a list of 1 to ${MAX_SUBS}.`);
  }
  for (const sub of subs) {
    if (typeof sub !== 'string' || sub.length < 1 || sub.length > MAX_SUB_LENGTH) {
      throw invalidRequest(`Each sub is 1 to ${MAX_SUB_LENGTH} characters.`);
    }
  }
  return subs as string[];
}

/** Looks people up by their `sub` (`resolveDirectoryUsers` in the Core API contract); see the search route. */
export async function POST(request: Request): Promise<Response> {
  return answer(async () => {
    await directoryGuard(request);
    const users = await resolveUsers(await getDatabase(), await subsOf(request), getConfig().url);
    return jsonResponse({ users });
  });
}
