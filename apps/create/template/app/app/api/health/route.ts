import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** The instance asks this before it sends anyone to the app (the manifest's `health`). It answers 200 once the database does. */
export async function GET() {
  try {
    await db().query('SELECT 1');
    return new Response('ok', { headers: { 'cache-control': 'no-store' } });
  } catch {
    return new Response('database unavailable', {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
