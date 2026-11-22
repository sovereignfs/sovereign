import { database } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** The instance asks this before it sends anyone to the app (the manifest's `health`). It answers 200 once the database does. */
export async function GET() {
  try {
    await (await database()).ping(2000);
    return new Response('ok', { headers: { 'cache-control': 'no-store' } });
  } catch {
    return new Response('database unavailable', {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
