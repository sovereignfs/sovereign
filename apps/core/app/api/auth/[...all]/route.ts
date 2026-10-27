import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '../../../../src/auth';

// Authentication answers are per request and per person: never cached.
export const dynamic = 'force-dynamic';

type Handler = (request: Request) => Promise<Response>;

// The instance is built on the first request, from the database and the settings, so the handler
// is looked up per call rather than at import (the build must not need a database).
async function handle(method: 'GET' | 'POST', request: Request): Promise<Response> {
  const handlers = toNextJsHandler(await getAuth());
  return (handlers[method] as Handler)(request);
}

export const GET = (request: Request) => handle('GET', request);
export const POST = (request: Request) => handle('POST', request);
