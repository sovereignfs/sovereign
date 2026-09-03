import { NextResponse } from 'next/server';
import { listUserMessages } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

const VALID_FILTERS = ['inbox', 'archived', 'unread'] as const;
type MessageFilter = (typeof VALID_FILTERS)[number];

function isMessageFilter(value: string | null): value is MessageFilter {
  return (VALID_FILTERS as readonly string[]).includes(value ?? '');
}

/** GET /api/inbox/messages — the current user's message inbox (RFC 0048), paginated and filtered. */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(request.url);
  const filterParam = url.searchParams.get('filter');
  const filter: MessageFilter = isMessageFilter(filterParam) ? filterParam : 'inbox';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 100);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);

  const pdb = await getPlatformDb();
  const { items, total } = await listUserMessages(pdb, userId, { filter, limit, offset });

  return NextResponse.json({ items, total });
}
