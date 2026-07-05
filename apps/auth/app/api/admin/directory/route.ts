import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { authAll } from '@/src/db';

const MIN_QUERY_LENGTH = 2;
const MAX_LIMIT = 50;

interface DirectoryRequest {
  mode?: 'search' | 'resolve';
  query?: string;
  ids?: string[];
  limit?: number;
}

interface DirectoryUserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function clampLimit(limit: unknown): number {
  if (limit === undefined) return 20;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
    throw new Error('limit must be a positive integer');
  }
  return Math.min(limit, MAX_LIMIT);
}

export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as DirectoryRequest | null;
  if (!body) return jsonError('invalid json body', 400);

  if (body.mode === 'search') {
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (query.length < MIN_QUERY_LENGTH) {
      return jsonError(`query must be at least ${String(MIN_QUERY_LENGTH)} characters`, 400);
    }

    let limit: number;
    try {
      limit = clampLimit(body.limit);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'invalid limit', 400);
    }

    const pattern = `%${escapeLike(query).toLowerCase()}%`;
    const rows = await authAll<DirectoryUserRow>(
      `SELECT id, email, name, image
         FROM "user"
        WHERE (active IS NULL OR active != ?)
          AND (
            LOWER(email) LIKE ? ESCAPE '\\'
            OR LOWER(COALESCE(name, '')) LIKE ? ESCAPE '\\'
          )
        ORDER BY LOWER(COALESCE(name, email)) ASC, LOWER(email) ASC
        LIMIT ?`,
      [false, pattern, pattern, limit],
    );
    return NextResponse.json(rows);
  }

  if (body.mode === 'resolve') {
    const ids = Array.isArray(body.ids)
      ? Array.from(new Set(body.ids.filter((id): id is string => typeof id === 'string')))
      : [];
    if (ids.length === 0) return NextResponse.json([]);
    if (ids.length > MAX_LIMIT) {
      return jsonError(`ids is limited to ${String(MAX_LIMIT)} users per request`, 400);
    }

    const placeholders = ids.map(() => '?').join(', ');
    const rows = await authAll<DirectoryUserRow>(
      `SELECT id, email, name, image
         FROM "user"
        WHERE (active IS NULL OR active != ?)
          AND id IN (${placeholders})
        ORDER BY LOWER(COALESCE(name, email)) ASC, LOWER(email) ASC`,
      [false, ...ids],
    );
    return NextResponse.json(rows);
  }

  return jsonError('mode must be search or resolve', 400);
}
