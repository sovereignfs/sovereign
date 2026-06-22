'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';
import { logActivity } from '@/src/activity';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

async function actorId(): Promise<string | null> {
  return (await headers()).get('x-sovereign-user-id');
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  return fetch(`${AUTH_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
      ...(init?.headers as Record<string, string>),
    },
  });
}

async function runtimeAdminFetch(path: string, init?: RequestInit): Promise<Response> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const runtimeUrl = `http://localhost:${process.env.PORT ?? '3000'}`;
  return fetch(`${runtimeUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
      ...(init?.headers as Record<string, string>),
    },
  });
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'role:assign')) {
    throw new Error('Insufficient privileges to assign roles.');
  }
  const userId = formData.get('userId') as string;
  const role = formData.get('role') as
    | 'platform:owner'
    | 'platform:admin'
    | 'platform:auditor'
    | 'platform:user';
  const res = await adminFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`Failed to change role: ${res.status}`);
  void logActivity({
    actorId: await actorId(),
    actorType: 'user',
    action: 'user.role_changed',
    subjectUserId: userId,
    targetType: 'user',
    targetId: userId,
    visibility: 'user',
    summary: `Role changed to ${role}`,
    metadata: { role },
  });
  revalidatePath('/console/users');
}

export async function toggleActiveAction(formData: FormData): Promise<void> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'user:manage')) {
    throw new Error('Insufficient privileges to manage users.');
  }
  const userId = formData.get('userId') as string;
  const active = formData.get('active') === 'true';
  const res = await adminFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error(`Failed to update user status: ${res.status}`);
  void logActivity({
    actorId: await actorId(),
    actorType: 'user',
    action: active ? 'user.reactivated' : 'user.deactivated',
    subjectUserId: userId,
    targetType: 'user',
    targetId: userId,
    visibility: 'user',
    summary: active ? 'User reactivated' : 'User deactivated',
  });
  revalidatePath('/console/users');
}

export async function resetMfaAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const userId = formData.get('userId') as string;
  const res = await adminFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ resetMfa: true }),
  });
  if (!res.ok) throw new Error(`Failed to reset MFA: ${res.status}`);
  void logActivity({
    actorId: await actorId(),
    actorType: 'user',
    action: 'user.mfa_reset',
    subjectUserId: userId,
    targetType: 'user',
    targetId: userId,
    visibility: 'user',
    summary: 'MFA reset by admin',
  });
  revalidatePath('/console/users');
}

export type InviteState =
  | { success: true; token: string; email: string }
  | { success: false; error: string };

export async function sendInviteAction(
  _prev: InviteState | null,
  formData: FormData,
): Promise<InviteState> {
  await sdk.auth.requireSession();

  const email = (formData.get('email') as string | null)?.trim();
  const expiresInDaysRaw = formData.get('expiresInDays') as string | null;
  const expiresInDays = expiresInDaysRaw ? Number(expiresInDaysRaw) : undefined;

  if (!email) return { success: false, error: 'Email is required.' };

  // Read via a computed key so Next.js does not inline the value at build time.
  const runtimeUrlKey = 'NEXT_PUBLIC_RUNTIME_URL';
  const runtimeUrl = process.env[runtimeUrlKey] ?? `http://localhost:${process.env.PORT ?? '3000'}`;
  const registerUrl = `${runtimeUrl}/register`;

  // The runtime's invites route creates the auth token AND sends the branded email.
  const res = await runtimeAdminFetch('/api/admin/invites', {
    method: 'POST',
    body: JSON.stringify({ email, expiresInDays, registerUrl }),
  });
  if (!res.ok) return { success: false, error: `Failed to create invite: ${res.status}` };

  const { token } = (await res.json()) as { token: string; email: string };

  void logActivity({
    actorId: await actorId(),
    actorType: 'user',
    action: 'user.invited',
    visibility: 'admin',
    summary: `Invited ${email}`,
    metadata: { email },
  });

  return { success: true, token, email };
}
