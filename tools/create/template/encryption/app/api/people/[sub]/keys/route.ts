import { CoreApiError } from '@sovereignfs/sdk';
import { person } from '@/lib/person';
import { unauthorised } from '@/lib/files';
import { sovereign } from '@/lib/sovereign';

export const dynamic = 'force-dynamic';

/**
 * Another person's public keys for this app, from core (sdk §8): what the page checks, then seals a note's key to. A 404 when they have
 * never opened this app, since their keys are made then. The page checks the account's signature itself; it does not trust this route.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ sub: string }> }) {
  const session = await person();
  if (!session) return unauthorised();
  try {
    const keys = await sovereign()
      .as({ sub: session.sub })
      .keys.person((await params).sub);
    return Response.json(keys, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof CoreApiError && error.status === 404) {
      return Response.json({ error: 'not-opened' }, { status: 404 });
    }
    throw error;
  }
}
