import { auth } from '@/lib/auth';
import { unauthorised } from '@/lib/files';
import { sovereign } from '@/lib/sovereign';

export const dynamic = 'force-dynamic';

/** People on the instance to share with, found by name (or a whole address) in its Directory, as the signed-in person. */
export async function GET(request: Request) {
  const session = await auth().getSession();
  if (!session) return unauthorised();
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  if (q.length < 2) return Response.json({ people: [] });
  const { users } = await sovereign().as({ sub: session.sub }).directory.searchUsers({ q });
  return Response.json(
    {
      people: users
        .filter((user) => user.sub !== session.sub)
        .map((user) => ({ sub: user.sub, name: user.name })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
