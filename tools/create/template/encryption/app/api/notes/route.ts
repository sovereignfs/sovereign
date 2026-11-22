import { person } from '@/lib/person';
import { unauthorised } from '@/lib/files';
import { notes } from '@/lib/notes';
import { sovereign } from '@/lib/sovereign';

export const dynamic = 'force-dynamic';

/**
 * The notes the signed-in person can read, encrypted as the browser stored them, with the names of the people they involve (from the
 * instance's Directory) so the page can say who shared what with whom. Nothing here opens a note.
 */
export async function GET() {
  const session = await person();
  if (!session) return unauthorised();
  const list = await notes().list(session.sub);
  const subs = [
    ...new Set(
      list.flatMap((note) => [note.owner, ...note.readers]).filter((s) => s !== session.sub),
    ),
  ];
  let names: Record<string, string> = {};
  if (subs.length > 0) {
    try {
      const { users } = await sovereign()
        .as({ sub: session.sub })
        .directory.resolveUsers({ subs: subs.slice(0, 100) });
      names = Object.fromEntries(users.map((user) => [user.sub, user.name]));
    } catch {
      // Without the Directory the page names nobody, and still opens every note.
    }
  }
  return Response.json(
    { me: session.sub, notes: list, names },
    { headers: { 'cache-control': 'no-store' } },
  );
}
