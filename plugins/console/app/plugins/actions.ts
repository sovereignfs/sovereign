'use server';

import { revalidatePath } from 'next/cache';
import { sdk, type DirectoryUser } from '@sovereignfs/sdk';
import { CHROME_PLUGIN_IDS } from '@/src/launcher-plugins';
import { ACTION_OK, apiErrorMessage, guarded, type ActionResult } from '../_lib/action-result';
import { adminFetch as sharedAdminFetch } from '../_lib/admin-fetch';
import { requireCapability } from '../_lib/authz';

/** Plugin access routes attribute grants to the acting admin (`x-sovereign-user-id`). */
function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  return sharedAdminFetch(path, { ...init, actor: true });
}

/**
 * Every action in this file is a Console admin surface. Server actions are
 * reachable by action id, so the middleware `adminOnly` gate on /console is not
 * on its own a sufficient guard — each action authorizes here. This matters
 * more than usual because `adminFetch` below attaches SOVEREIGN_ADMIN_KEY:
 * an unauthorized caller reaching these would be borrowing the platform's own
 * admin credentials.
 *
 * Non-admin self-service enable/disable is a separate surface entirely
 * (`plugins:self-manage`, POST /api/plugins/[id]/self-service) and does not
 * route through here.
 */
async function requirePluginManage(): Promise<void> {
  await requireCapability('plugin:manage');
}

export type PluginToggleActionState = { success: true } | { success: false; error: string };

export async function togglePluginAction(
  _prev: PluginToggleActionState | null,
  formData: FormData,
): Promise<PluginToggleActionState> {
  await requirePluginManage();
  const pluginId = formData.get('pluginId') as string;
  const enabled = formData.get('enabled') === 'true';
  // Chrome plugins (Console itself, Launcher, Account, Inbox) are the shell —
  // the proxy 404s a disabled plugin's whole prefix, so disabling Console
  // from Console locked every admin out with no UI path back. The runtime
  // route refuses too; this keeps the refusal an inline result, not a 403.
  if (CHROME_PLUGIN_IDS.has(pluginId)) {
    return { success: false, error: 'This app is part of the platform shell and is always on.' };
  }
  const res = await adminFetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) return { success: false, error: `Failed to toggle plugin: ${res.status}` };
  revalidatePath('/console/plugins');
  return { success: true };
}

// ─── Plugin catalog and activation (RFC 0065 Task 13.8) ──────────────────────

export interface PluginCatalogEntry {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

/**
 * Read-only — unlike every other export in this file, this backs both the
 * Plugins management page *and* Overview's app-count stats
 * (`buildPluginRows`, `../page.tsx`), which every Console role including
 * `platform:auditor` must be able to load. Gating it behind
 * `requirePluginManage()` (as a copy-paste of this file's real mutation
 * actions once did) crashed Overview outright for auditors, since
 * `buildPluginRows` is awaited alongside the rest of Overview's data in one
 * `Promise.all` — a session check is the correct minimum here, matching the
 * other plain read helpers in `../page.tsx` (`getUsers`/`getGroups`/
 * `getEntitlements`), not the manage-capability guard the actual
 * activate/toggle mutations below still enforce independently.
 */
export async function getPluginCatalogAction(): Promise<PluginCatalogEntry[]> {
  await sdk.auth.requireSession();
  const res = await adminFetch('/api/admin/plugins/catalog');
  if (!res.ok) return [];
  const body = (await res.json()) as { catalog: PluginCatalogEntry[] };
  return body.catalog;
}

export type ActivatePluginActionState =
  { success: true; alreadyActive: boolean } | { success: false; error: string };

export async function activatePluginAction(
  _prev: ActivatePluginActionState | null,
  formData: FormData,
): Promise<ActivatePluginActionState> {
  await requirePluginManage();
  const pluginId = formData.get('pluginId') as string;

  const res = await adminFetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}/activate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `Failed to activate plugin: ${res.status}` };
  }
  const body = (await res.json()) as { activated: boolean; reason?: string };
  if (body.reason === 'hard-disabled') {
    return {
      success: false,
      error: 'This plugin is hard-disabled by its manifest and cannot be activated.',
    };
  }
  revalidatePath('/console/plugins');
  return { success: true, alreadyActive: !body.activated };
}

// ─── Plugin access policy (RFC 0065 Task 13.7) ───────────────────────────────

export type PluginAccessPolicyValue =
  'everyone' | 'admins' | 'selected_users' | 'selected_groups' | 'disabled';

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
  await requirePluginManage();
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
  await requirePluginManage();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return sdk.directory.searchUsers({ query: trimmed, limit: 8 });
}

export interface GroupOption {
  id: string;
  name: string;
}

export async function listGroupOptions(): Promise<GroupOption[]> {
  await requirePluginManage();
  const res = await adminFetch('/api/admin/groups');
  if (!res.ok) return [];
  return (await res.json()) as GroupOption[];
}

export type PluginAccessActionState = { success: true } | { success: false; error: string };

export async function setPluginAccessPolicyAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    await requirePluginManage();
    const pluginId = formData.get('pluginId') as string;
    const accessPolicy = formData.get('accessPolicy') as string;
    const selfService = formData.get('selfService') === 'true';

    const res = await adminFetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}/access`, {
      method: 'PATCH',
      body: JSON.stringify({ accessPolicy, selfService }),
    });
    if (!res.ok) {
      return { ok: false, error: await apiErrorMessage(res, 'Failed to update access policy') };
    }
    revalidatePath('/console/plugins');
    return ACTION_OK;
  });
}

export async function grantPluginAccessUserAction(
  _prev: PluginAccessActionState | null,
  formData: FormData,
): Promise<PluginAccessActionState> {
  await requirePluginManage();
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

export async function revokePluginAccessUserAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    await requirePluginManage();
    const pluginId = formData.get('pluginId') as string;
    const userId = formData.get('userId') as string;

    const res = await adminFetch(
      `/api/admin/plugins/${encodeURIComponent(pluginId)}/access/users/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, 'Failed to revoke access') };
    revalidatePath('/console/plugins');
    return ACTION_OK;
  });
}

export async function grantPluginAccessGroupAction(
  _prev: PluginAccessActionState | null,
  formData: FormData,
): Promise<PluginAccessActionState> {
  await requirePluginManage();
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

export async function revokePluginAccessGroupAction(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    await requirePluginManage();
    const pluginId = formData.get('pluginId') as string;
    const groupId = formData.get('groupId') as string;

    const res = await adminFetch(
      `/api/admin/plugins/${encodeURIComponent(pluginId)}/access/groups/${encodeURIComponent(groupId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, 'Failed to revoke access') };
    revalidatePath('/console/plugins');
    return ACTION_OK;
  });
}
