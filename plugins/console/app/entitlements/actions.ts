'use server';

import { revalidatePath } from 'next/cache';
import { sdk } from '@sovereignfs/sdk';

const RUNTIME_URL = `http://localhost:${process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000'}`;

export async function saveLicenseKeyAction(
  pluginId: string,
  privateKey: string,
  publicKey?: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'role:assign')) {
    return { ok: false, error: 'Unauthorized — only platform owners can save license keys.' };
  }
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  let res: Response;
  try {
    res = await fetch(`${RUNTIME_URL}/api/admin/license-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminKey}` },
      body: JSON.stringify({ pluginId, privateKey, ...(publicKey ? { publicKey } : {}) }),
    });
  } catch {
    return { ok: false, error: 'Failed to reach the runtime API.' };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? `API error ${res.status}.` };
  }
  revalidatePath('/console/entitlements');
  return { ok: true };
}

export async function deleteLicenseKeyAction(
  pluginId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'role:assign')) {
    return { ok: false, error: 'Unauthorized — only platform owners can remove license keys.' };
  }
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  let res: Response;
  try {
    res = await fetch(
      `${RUNTIME_URL}/api/admin/license-keys?pluginId=${encodeURIComponent(pluginId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${adminKey}` } },
    );
  } catch {
    return { ok: false, error: 'Failed to reach the runtime API.' };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? `API error ${res.status}.` };
  }
  revalidatePath('/console/entitlements');
  return { ok: true };
}

export async function grantLicenseAction(
  licenseToken: string,
  targetUserId: string,
  pluginId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'role:assign')) {
    return { ok: false, error: 'Unauthorized — only platform owners can grant licenses.' };
  }

  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  let res: Response;
  try {
    res = await fetch(`${RUNTIME_URL}/api/admin/entitlements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminKey}`,
      },
      body: JSON.stringify({ licenseToken, targetUserId, pluginId }),
    });
  } catch {
    return { ok: false, error: 'Failed to reach the runtime API.' };
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? `API error ${res.status}.` };
  }

  revalidatePath('/console/entitlements');
  return { ok: true };
}
