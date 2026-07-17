import { NextResponse } from 'next/server';
import {
  deleteUserGroup,
  getUserGroupById,
  getUserGroupUsage,
  updateUserGroup,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const pdb = await getPlatformDb();
  const existing = await getUserGroupById(pdb, id);
  if (!existing) return NextResponse.json({ error: 'group not found' }, { status: 404 });

  const body = (await request.json()) as {
    name?: unknown;
    slug?: unknown;
    description?: unknown;
  };
  const fields: { name?: string; slug?: string; description?: string | null } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    fields.name = body.name;
  }
  if (body.slug !== undefined) {
    if (typeof body.slug !== 'string' || body.slug.trim() === '') {
      return NextResponse.json({ error: 'slug must be a non-empty string' }, { status: 400 });
    }
    fields.slug = body.slug;
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 });
    }
    fields.description = body.description;
  }

  await updateUserGroup(pdb, id, fields);

  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'group.updated',
    targetType: 'group',
    targetId: id,
    visibility: 'admin',
    summary: `Group "${existing.name}" updated`,
    metadata: { groupId: id, ...fields },
  });

  const updated = await getUserGroupById(pdb, id);
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const pdb = await getPlatformDb();
  const existing = await getUserGroupById(pdb, id);
  if (!existing) return NextResponse.json({ error: 'group not found' }, { status: 404 });

  const force = new URL(request.url).searchParams.get('force') === 'true';
  const usage = await getUserGroupUsage(pdb, id);
  if (usage.referencedByPluginAccessPolicies && !force) {
    return NextResponse.json(
      {
        error: 'group is referenced by one or more plugin access policies',
        usage,
      },
      { status: 409 },
    );
  }

  await deleteUserGroup(pdb, id);

  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'group.deleted',
    targetType: 'group',
    targetId: id,
    visibility: 'admin',
    summary: `Group "${existing.name}" deleted`,
    metadata: { groupId: id, name: existing.name, forced: force },
  });

  return NextResponse.json({ id });
}
