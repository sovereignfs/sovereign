// Core's logout notice (auth.md §8): the back-channel address in sovereign.manifest.json.
import { notices } from '@/lib/notices';
import { waysIn } from '@/lib/sign-in';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!waysIn().core) return new Response(null, { status: 404 });
  return (await notices()).backChannelLogout(request);
}
