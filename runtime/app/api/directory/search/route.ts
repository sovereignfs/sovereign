import { NextResponse } from 'next/server';
import {
  checkDirectoryRateLimit,
  normalizeSearchUsersInput,
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

  const body = (await request.json().catch(() => null)) as {
    query?: string;
    limit?: number;
  } | null;
  if (!body || typeof body.query !== 'string') {
    return jsonError('query is required', 400);
  }

  let input;
  try {
    input = normalizeSearchUsersInput({ query: body.query, limit: body.limit });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'invalid search request', 400);
  }

  const res = await fetch(`${AUTH_URL}/api/admin/directory`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'search', ...input }),
  });
  if (!res.ok) {
    return jsonError('directory lookup failed', 502);
  }

  const rows = (await res.json().catch(() => [])) as unknown[];
  return NextResponse.json(toDirectoryUsers(rows));
}
