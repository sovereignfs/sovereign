// Core's notice that a person deleted their account at the instance (core-app §4.5): the address in sovereign.manifest.json.
import { notices } from '@/lib/notices';
import { waysIn } from '@/lib/sign-in';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!waysIn().core) return new Response(null, { status: 404 });
  return (await notices()).accountDeleted(request);
}
