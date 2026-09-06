'use server';

import { revalidatePath } from 'next/cache';
import { sdk, type DirectoryUser } from '@sovereignfs/sdk';
import { ACTION_OK, apiErrorMessage, guarded, type ActionResult } from '../_lib/action-result';
import { adminFetch } from '../_lib/admin-fetch';
import { requireCapability } from '../_lib/authz';

const MANAGE_GROUPS = 'Insufficient privileges to manage groups.';

/** Group routes attribute writes to the acting admin (`x-sovereign-user-id`). */
function groupsApi(path: string, init?: RequestInit): Promise<Response> {
  return adminFetch(path, { ...init, actor: true });
}

export type GroupActionState = { success: true } | { success: false; error: string };

export async function createGroupAction(
  _prev: GroupActionState | null,
  formData: FormData,
): Promise<GroupActionState> {
  await requireCapability('user:manage', MANAGE_GROUPS);

  const name = (formData.get('name') as string | null)?.trim();
  const description = (formData.get('description') as string | null)?.trim() || undefined;
  if (!name) return { success: false, error: 'Name is required.' };

  const res = await groupsApi('/api/admin/groups', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    return { success: false, error: await apiErrorMessage(res, 'Failed to create group') };
  }

  revalidatePath('/console/groups');
  return { success: true };
}

/** `useActionState`-shaped: the Details form shows pending + inline error. */
export async function updateGroupAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    await requireCapability('user:manage', MANAGE_GROUPS);
    const id = formData.get('id') as string;
    const name = (formData.get('name') as string | null)?.trim();
    const description = (formData.get('description') as string | null)?.trim() || null;
    if (!name) return { ok: false, error: 'Name is required.' };

    const res = await groupsApi(`/api/admin/groups/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, 'Failed to update group') };

    revalidatePath('/console/groups');
    return { ok: true, message: 'Group saved.' };
  });
}

/**
 * A group still referenced by an app access policy is refused (409) unless
 * `force` — surfaced as `blocked: true` so the confirm dialog can offer
 * "Delete anyway" instead of a dead end.
 */
export async function deleteGroupAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    await requireCapability('user:manage', MANAGE_GROUPS);
    const id = formData.get('id') as string;
    const force = formData.get('force') === 'true';

    const res = await groupsApi(
      `/api/admin/groups/${encodeURIComponent(id)}${force ? '?force=true' : ''}`,
      { method: 'DELETE' },
    );
    if (res.status === 409) {
      return {
        ok: false,
        blocked: true,
        error:
          'This group is used by an app access policy. Deleting it removes the group from that policy.',
      };
    }
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, 'Failed to delete group') };

    revalidatePath('/console/groups');
    return { ok: true, message: 'Group deleted.' };
  });
}

export interface ResolvedGroupMember {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  addedAt: number;
}

/** Group membership joined with display-safe directory info, for the detail pane. */
export async function listResolvedGroupMembers(groupId: string): Promise<ResolvedGroupMember[]> {
  await requireCapability('user:manage', MANAGE_GROUPS);

  const res = await groupsApi(`/api/admin/groups/${encodeURIComponent(groupId)}/members`);
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
    image: byId.get(m.userId)?.image ?? null,
  }));
}

export async function searchGroupDirectoryUsers(query: string): Promise<DirectoryUser[]> {
  await requireCapability('user:manage', MANAGE_GROUPS);
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return sdk.directory.searchUsers({ query: trimmed, limit: 8 });
}

export async function addGroupMemberAction(
  _prev: GroupActionState | null,
  formData: FormData,
): Promise<GroupActionState> {
  await requireCapability('user:manage', MANAGE_GROUPS);

  const groupId = formData.get('groupId') as string;
  const userId = formData.get('userId') as string;
  if (!userId) return { success: false, error: 'Pick a person from the search results.' };

  const res = await groupsApi(`/api/admin/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    return { success: false, error: await apiErrorMessage(res, 'Failed to add member') };
  }

  revalidatePath('/console/groups');
  return { success: true };
}

export async function removeGroupMemberAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    await requireCapability('user:manage', MANAGE_GROUPS);
    const groupId = formData.get('groupId') as string;
    const userId = formData.get('userId') as string;

    const res = await groupsApi(
      `/api/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, 'Failed to remove member') };

    revalidatePath('/console/groups');
    return ACTION_OK;
  });
}
