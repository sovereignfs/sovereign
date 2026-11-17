import { CoreApiError } from '@sovereignfs/sdk';
import { auth } from '@/lib/auth';
import { unauthorised } from '@/lib/files';
import { sovereign } from '@/lib/sovereign';

export const dynamic = 'force-dynamic';

/** The signed-in person's own keys for this app (sdk §8): public keys, and private keys the server cannot open. */
export async function GET() {
  const session = await auth().getSession();
  if (!session) return unauthorised();
  try {
    const keys = await sovereign().as({ sub: session.sub }).keys.me();
    return Response.json(keys, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof CoreApiError && error.status === 404) {
      return Response.json({ error: 'not-opened' }, { status: 404 });
    }
    throw error;
  }
}
