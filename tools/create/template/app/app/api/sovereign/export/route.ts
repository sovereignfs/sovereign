// Core's request for a person's part of their export (core-app §4.7.2): the address in sovereign.manifest.json.
import { exportPart } from '@/lib/notices';
import { waysIn } from '@/lib/sign-in';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!waysIn().core) return new Response(null, { status: 404 });
  return exportPart(request);
}
