'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { sdk, type DirectoryUser } from '@sovereignfs/sdk';

// Self-fetch address for the runtime's own admin API. Native dev may run on
// RUNTIME_PORT; otherwise the runtime defaults to localhost:3000.
const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;

/**
 * This is a fresh server-to-server request, not a passthrough of the
 * browser's request — middleware never sees it, so `x-sovereign-user-id`
 * must be forwarded explicitly or actor-attribution checks on the target
 * route (e.g. the plugin access grant endpoints) 401 even though the caller
 * is a fully authenticated admin.
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

export async function togglePluginAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const pluginId = formData.get('pluginId') as string;
  const enabled = formData.get('enabled') === 'true';
  const res = await adminFetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Failed to toggle plugin: ${res.status}`);
  revalidatePath('/console/plugins');
}

// ─── Plugin access policy (RFC 0065 Task 13.7) ───────────────────────────────

export type PluginAccessPolicyValue =
  | 'everyone'
  | 'admins'
  | 'selected_users'
  | 'selected_groups'
  | 'disabled';

export interface PluginAccessGrantRow {
  userId: string;
  grantedByUserId: string;
  grantedAt: number;
}

export interface PluginAccessGroupGrantRow {
  groupId: string;
  grantedByUserId: string;
  grantedAt: number;
}

export interface PluginAccessState {
  accessPolicy: PluginAccessPolicyValue;
  selfService: boolean;
  users: PluginAccessGrantRow[];
  groups: PluginAccessGroupGrantRow[];
}

export interface ResolvedPluginAccessUser {
  userId: string;
  name: string | null;
  email: string;
}

export interface ResolvedPluginAccessGroup {
  groupId: string;
  name: string;
}

export async function getPluginAccessState(pluginId: string): Promise<PluginAccessState> {
  await sdk.auth.requireSession();
  const res = await adminFetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}/access`);
  if (!res.ok) {
    return { accessPolicy: 'everyone', selfService: false, users: [], groups: [] };
  }
  const body = (await res.json()) as PluginAccessState;
  return body;
}

/** Grants joined with display-safe directory/group info, for the Access dialog. */
export async function listResolvedPluginAccessUsers(
  pluginId: string,
): Promise<ResolvedPluginAccessUser[]> {
  const state = await getPluginAccessState(pluginId);
  if (state.users.length === 0) return [];

  const users = await sdk.directory.resolveUsers({ ids: state.users.map((u) => u.userId) });
  const byId = new Map(users.map((u) => [u.id, u]));
  return state.users.map((u) => ({
    userId: u.userId,
    name: byId.get(u.userId)?.name ?? null,
    email: byId.get(u.userId)?.email ?? u.userId,
  }));
}

export async function listResolvedPluginAccessGroups(
  pluginId: string,
): Promise<ResolvedPluginAccessGroup[]> {
  const state = await getPluginAccessState(pluginId);
  if (state.groups.length === 0) return [];

  const res = await adminFetch('/api/admin/groups');
  const allGroups = res.ok ? ((await res.json()) as { id: string; name: string }[]) : [];
  const byId = new Map(allGroups.map((g) => [g.id, g.name]));
  return state.groups.map((g) => ({ groupId: g.groupId, name: byId.get(g.groupId) ?? g.groupId }));
}

export async function searchPluginAccessDirectoryUsers(query: string): Promise<DirectoryUser[]> {
  await sdk.auth.requireSession();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return sdk.directory.searchUsers({ query: trimmed, limit: 8 });
}

export interface GroupOption {
  id: string;
  name: string;
}

export async function listGroupOptions(): Promise<GroupOption[]> {
  await sdk.auth.requireSession();
  const res = await adminFetch('/api/admin/groups');
  if (!res.ok) return [];
  return (await res.json()) as GroupOption[];
}

export type PluginAccessActionState = { success: true } | { success: false; error: string };

export async function setPluginAccessPolicyAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const pluginId = formData.get('pluginId') as string;
  const accessPolicy = formData.get('accessPolicy') as string;
  const selfService = formData.get('selfService') === 'true';

  const res = await adminFetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}/access`, {
    method: 'PATCH',
    body: JSON.stringify({ accessPolicy, selfService }),
  });
  if (!res.ok) throw new Error(`Failed to update access policy: ${res.status}`);
  revalidatePath('/console/plugins');
}

export async function grantPluginAccessUserAction(
  _prev: PluginAccessActionState | null,
  formData: FormData,
): Promise<PluginAccessActionState> {
  await sdk.auth.requireSession();
  const pluginId = formData.get('pluginId') as string;
  const userId = formData.get('userId') as string;
  if (!userId) return { success: false, error: 'Pick a person from the search results.' };

  const res = await adminFetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}/access/users`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `Failed to grant access: ${res.status}` };
  }
  revalidatePath('/console/plugins');
  return { success: true };
}

export async function revokePluginAccessUserAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const pluginId = formData.get('pluginId') as string;
  const userId = formData.get('userId') as string;

  const res = await adminFetch(
    `/api/admin/plugins/${encodeURIComponent(pluginId)}/access/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to revoke access: ${res.status}`);
  revalidatePath('/console/plugins');
}

export async function grantPluginAccessGroupAction(
  _prev: PluginAccessActionState | null,
  formData: FormData,
): Promise<PluginAccessActionState> {
  await sdk.auth.requireSession();
  const pluginId = formData.get('pluginId') as string;
  const groupId = formData.get('groupId') as string;
  if (!groupId) return { success: false, error: 'Pick a group.' };

  const res = await adminFetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}/access/groups`, {
    method: 'POST',
    body: JSON.stringify({ groupId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `Failed to grant access: ${res.status}` };
  }
  revalidatePath('/console/plugins');
  return { success: true };
}

export async function revokePluginAccessGroupAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const pluginId = formData.get('pluginId') as string;
  const groupId = formData.get('groupId') as string;

  const res = await adminFetch(
    `/api/admin/plugins/${encodeURIComponent(pluginId)}/access/groups/${encodeURIComponent(groupId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to revoke access: ${res.status}`);
  revalidatePath('/console/plugins');
}
