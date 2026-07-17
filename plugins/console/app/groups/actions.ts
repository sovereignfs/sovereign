'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { sdk, type DirectoryUser } from '@sovereignfs/sdk';

const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;

/**
 * Server-to-server fetch to runtime's own admin API. This is a fresh outbound
 * request, not a passthrough of the browser's request — middleware never sees
 * it, so `x-sovereign-user-id` must be forwarded explicitly or the target
 * route's actor-attribution check (e.g. POST /api/admin/groups) 401s even
 * though the caller is a fully authenticated admin.
 */
async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const actorId = (await headers()).get('x-sovereign-user-id') ?? '';
  return fetch(`${SELF_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
      'x-sovereign-user-id': actorId,
      ...(init?.headers as Record<string, string>),
    },
  });
}

function requireGroupManageCapability(session: Awaited<ReturnType<typeof sdk.auth.getSession>>) {
  if (!sdk.auth.hasCapability(session, 'user:manage')) {
    throw new Error('Insufficient privileges to manage groups.');
  }
}

export type GroupActionState = { success: true } | { success: false; error: string };

export async function createGroupAction(
  _prev: GroupActionState | null,
  formData: FormData,
): Promise<GroupActionState> {
  const session = await sdk.auth.requireSession();
  requireGroupManageCapability(session);

  const name = (formData.get('name') as string | null)?.trim();
  const description = (formData.get('description') as string | null)?.trim() || undefined;
  if (!name) return { success: false, error: 'Name is required.' };

  const res = await adminFetch('/api/admin/groups', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `Failed to create group: ${res.status}` };
  }

  revalidatePath('/console/groups');
  return { success: true };
}

export async function updateGroupAction(formData: FormData): Promise<void> {
  const session = await sdk.auth.requireSession();
  requireGroupManageCapability(session);

  const id = formData.get('id') as string;
  const name = (formData.get('name') as string | null)?.trim();
  const description = (formData.get('description') as string | null)?.trim() || null;

  const res = await adminFetch(`/api/admin/groups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...(name ? { name } : {}), description }),
  });
  if (!res.ok) throw new Error(`Failed to update group: ${res.status}`);

  revalidatePath('/console/groups');
}

export async function deleteGroupAction(formData: FormData): Promise<void> {
  const session = await sdk.auth.requireSession();
  requireGroupManageCapability(session);

  const id = formData.get('id') as string;
  const force = formData.get('force') === 'true';

  const res = await adminFetch(
    `/api/admin/groups/${encodeURIComponent(id)}${force ? '?force=true' : ''}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to delete group: ${res.status}`);
  }

  revalidatePath('/console/groups');
}

export interface ResolvedGroupMember {
  userId: string;
  name: string | null;
  email: string;
  addedAt: number;
}

/** Group membership joined with display-safe directory info, for the manage dialog. */
export async function listResolvedGroupMembers(groupId: string): Promise<ResolvedGroupMember[]> {
  const session = await sdk.auth.requireSession();
  requireGroupManageCapability(session);

  const res = await adminFetch(`/api/admin/groups/${encodeURIComponent(groupId)}/members`);
  if (!res.ok) return [];
  const members = (await res.json()) as { userId: string; addedAt: number }[];
  if (members.length === 0) return [];

  const users = await sdk.directory.resolveUsers({ ids: members.map((m) => m.userId) });
  const byId = new Map(users.map((u) => [u.id, u]));
  return members.map((m) => ({
    userId: m.userId,
    addedAt: m.addedAt,
    name: byId.get(m.userId)?.name ?? null,
    email: byId.get(m.userId)?.email ?? m.userId,
  }));
}

export async function searchGroupDirectoryUsers(query: string): Promise<DirectoryUser[]> {
  const session = await sdk.auth.requireSession();
  requireGroupManageCapability(session);
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return sdk.directory.searchUsers({ query: trimmed, limit: 8 });
}

export async function addGroupMemberAction(
  _prev: GroupActionState | null,
  formData: FormData,
): Promise<GroupActionState> {
  const session = await sdk.auth.requireSession();
  requireGroupManageCapability(session);

  const groupId = formData.get('groupId') as string;
  const userId = formData.get('userId') as string;
  if (!userId) return { success: false, error: 'Pick a person from the search results.' };

  const res = await adminFetch(`/api/admin/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `Failed to add member: ${res.status}` };
  }

  revalidatePath('/console/groups');
  return { success: true };
}

export async function removeGroupMemberAction(formData: FormData): Promise<void> {
  const session = await sdk.auth.requireSession();
  requireGroupManageCapability(session);

  const groupId = formData.get('groupId') as string;
  const userId = formData.get('userId') as string;

  const res = await adminFetch(
    `/api/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to remove member: ${res.status}`);

  revalidatePath('/console/groups');
}
