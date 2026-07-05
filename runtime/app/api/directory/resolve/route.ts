import { NextResponse } from 'next/server';
import {
  checkDirectoryRateLimit,
  normalizeResolveUsersInput,
  toDirectoryUsers,
} from '@/src/directory';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

function jsonError(message: string, status: number, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return jsonError('unauthenticated', 401);

  const limited = checkDirectoryRateLimit(userId);
  if (!limited.allowed) {
    return jsonError('rate limit exceeded', 429, {
      'Retry-After': String(limited.retryAfterSeconds ?? 60),
    });
  }

  const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
  if (!body || !Array.isArray(body.ids)) {
    return jsonError('ids is required', 400);
  }

  let input;
  try {
    input = normalizeResolveUsersInput({ ids: body.ids });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'invalid resolve request', 400);
  }

  if (input.ids.length === 0) return NextResponse.json([]);

  const res = await fetch(`${AUTH_URL}/api/admin/directory`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'resolve', ...input }),
  });
  if (!res.ok) {
    return jsonError('directory lookup failed', 502);
  }

  const rows = (await res.json().catch(() => [])) as unknown[];
  return NextResponse.json(toDirectoryUsers(rows));
}
