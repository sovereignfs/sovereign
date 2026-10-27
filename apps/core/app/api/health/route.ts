import { healthReport } from '../../../src/health';

// Never cached: a health check that answers from a cache says nothing.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(healthReport(), { headers: { 'Cache-Control': 'no-store' } });
}
