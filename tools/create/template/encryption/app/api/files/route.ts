import { auth } from '@/lib/auth';
import { failure, files, refuseCrossOrigin, unauthorised } from '@/lib/files';

export const dynamic = 'force-dynamic';

/** The signed-in person's own files, newest first, and how much of their space they use. */
export async function GET() {
  const session = await auth().getSession();
  if (!session) return unauthorised();
  const [list, usage] = await Promise.all([files().list(session.sub), files().usage(session.sub)]);
  return Response.json(
    { files: list.map((file) => ({ ...file, url: `/api/files/${file.id}` })), usage },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/** Stores a file for the signed-in person. The body is the file itself and its name is in `X-File-Name`, percent-encoded. */
export async function POST(request: Request) {
  const refused = refuseCrossOrigin(request);
  if (refused) return refused;
  const session = await auth().getSession();
  if (!session) return unauthorised();
  try {
    const length = Number(request.headers.get('content-length') ?? Number.NaN);
    let name: string | undefined;
    try {
      name = decodeURIComponent(request.headers.get('x-file-name') ?? '');
    } catch {
      name = undefined;
    }
    const record = await files().put(
      session.sub,
      (request.body ?? new Uint8Array(0)) as unknown as AsyncIterable<Uint8Array>,
      // Without a length the upload reserves all the room the person has left, so uploads of unknown size run one at a time.
      { name, ...(Number.isSafeInteger(length) && length >= 0 ? { size: length } : {}) },
    );
    return Response.json({ ...record, url: `/api/files/${record.id}` }, { status: 201 });
  } catch (error) {
    const known = failure(error);
    if (known) return known;
    throw error;
  }
}
