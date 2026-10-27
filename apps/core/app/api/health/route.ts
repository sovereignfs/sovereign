import { healthReport } from '../../../src/health';

// Never cached: a health check that answers from a cache says nothing.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const report = await healthReport();
  return Response.json(report, {
    status: report.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
