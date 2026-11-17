import { auth } from '@/lib/auth';
import { refuseCrossOrigin, unauthorised } from '@/lib/files';
import { checkWrite, NoteError, notes } from '@/lib/notes';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const refused = (error: unknown) =>
  error instanceof NoteError
    ? Response.json({ error: error.message }, { status: error.status })
    : undefined;

/** Writes one of the signed-in person's notes, new or changed, with everyone who may read it: what the browser encrypted, as it is. */
export async function PUT(request: Request, { params }: Context) {
  const cross = refuseCrossOrigin(request);
  if (cross) return cross;
  const session = await auth().getSession();
  if (!session) return unauthorised();
  try {
    const note = checkWrite(session.sub, (await params).id, await request.json().catch(() => null));
    await notes().save(session.sub, note);
    return new Response(null, { status: 204 });
  } catch (error) {
    const answer = refused(error);
    if (answer) return answer;
    throw error;
  }
}

/** Deletes one of the signed-in person's notes, and every key sealed for it. */
export async function DELETE(request: Request, { params }: Context) {
  const cross = refuseCrossOrigin(request);
  if (cross) return cross;
  const session = await auth().getSession();
  if (!session) return unauthorised();
  const removed = await notes().remove(session.sub, (await params).id);
  return new Response(null, { status: removed ? 204 : 404 });
}
