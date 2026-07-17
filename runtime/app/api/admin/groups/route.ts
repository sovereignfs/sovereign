import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createUserGroup, listUserGroups } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

/** Kebab-case a group name into a slug candidate. Not guaranteed unique. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const groups = await listUserGroups(await getPlatformDb());
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
