import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createUserGroup, listUserGroupsWithMemberCount } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

/**
 * Kebab-case a group name into a slug candidate. Not guaranteed unique.
 *
 * The leading/trailing dash trim is a manual index scan, not a regex. Even
 * `/-+$/` alone (no `g`, no alternation) is quadratic: for an input of many
 * dashes followed by a non-dash, non-end character, `-+` greedily consumes
 * the whole run, backtracks it one character at a time to retry `$` at every
 * position, fails, then the engine restarts the same backtrack from the next
 * starting offset — O(n^2) with a single anchored quantifier, no `g` flag
 * required. A plain index walk has no backtracking to exploit.
 */
function slugify(name: string): string {
  const collapsed = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  let start = 0;
  while (start < collapsed.length && collapsed[start] === '-') start++;
  let end = collapsed.length;
  while (end > start && collapsed[end - 1] === '-') end--;
  return collapsed.slice(start, end);
}

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const groups = await listUserGroupsWithMemberCount(await getPlatformDb());
  return NextResponse.json(groups);
}

export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    name?: unknown;
    slug?: unknown;
    description?: unknown;
  };
  const { name } = body;
  if (typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'name (non-empty string) is required' }, { status: 400 });
  }
  const slug = typeof body.slug === 'string' && body.slug.trim() !== '' ? body.slug : slugify(name);
  if (slug === '') {
    return NextResponse.json({ error: 'could not derive a slug from name' }, { status: 400 });
  }
  const description =
    typeof body.description === 'string' && body.description.trim() !== ''
      ? body.description
      : null;

  const actorId = request.headers.get('x-sovereign-user-id');
  if (!actorId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const id = randomUUID();
  const pdb = await getPlatformDb();
  await createUserGroup(pdb, id, name, slug, description, actorId);

  void logActivity({
    actorId,
    actorType: 'user',
    action: 'group.created',
    targetType: 'group',
    targetId: id,
    visibility: 'admin',
    summary: `Group "${name}" created`,
    metadata: { groupId: id, name, slug },
  });

  return NextResponse.json({ id, name, slug, description });
}
