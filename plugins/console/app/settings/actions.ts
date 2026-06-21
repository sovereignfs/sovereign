'use server';

import { revalidatePath } from 'next/cache';
import { sdk } from '@sovereignfs/sdk';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

async function patchSettings(body: Record<string, unknown>): Promise<ActionResult> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${SELF_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    return { ok: false, error: detail ?? `Failed to update settings: ${res.status}` };
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
  return { ok: true, message: 'Saved.' };
}

export async function updateTenantNameAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const tenantName = (formData.get('tenantName') as string | null)?.trim();
  if (!tenantName) return { ok: false, error: 'Tenant name is required.' };
  return patchSettings({ tenantName });
}

export async function updateInviteOnlyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return patchSettings({ inviteOnly: formData.get('inviteOnly') === 'on' });
}

export async function updateRootPluginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const rootPluginId = formData.get('rootPluginId') as string | null;
  if (!rootPluginId) return { ok: false, error: 'Select a plugin.' };
  return patchSettings({ rootPluginId });
}

export async function updateBrandingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';

  const brandName = (formData.get('brandName') as string | null)?.trim() || null;
  const brandPrimary = (formData.get('brandPrimary') as string | null)?.trim() || null;
  const brandLogo = (formData.get('brandLogo') as string | null)?.trim() || null;
  const brandLogoDark = (formData.get('brandLogoDark') as string | null)?.trim() || null;
  const brandFavicon = (formData.get('brandFavicon') as string | null)?.trim() || null;
  const emailFromName = (formData.get('emailFromName') as string | null)?.trim() || null;
  const emailLogo = (formData.get('emailLogo') as string | null)?.trim() || null;

  if (brandPrimary && !HEX_COLOR_RE.test(brandPrimary)) {
    return { ok: false, error: 'Primary colour must be a 6-digit hex value, e.g. #3b82f6.' };
  }

  const body = {
    brandName,
    brandPrimary,
    brandLogo,
    brandLogoDark,
    brandFavicon,
    emailFromName,
    emailLogo,
  };
  const res = await fetch(`${SELF_URL}/api/admin/tenant-branding`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    return { ok: false, error: detail ?? `Failed to update branding: ${res.status}` };
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
  return { ok: true, message: 'Branding saved.' };
}

export async function uploadLogoAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const dark = formData.get('dark') === '1';
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { ok: false, error: 'No file selected.' };
  const uploadForm = new FormData();
  uploadForm.set('file', file);
  const url = `${SELF_URL}/api/brand/logo${dark ? '?dark=1' : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminKey}` },
    body: uploadForm,
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    return { ok: false, error: detail ?? `Failed to upload logo: ${res.status}` };
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
  return { ok: true, message: `Logo (${dark ? 'dark' : 'light'}) uploaded.` };
}

export async function uploadFaviconAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { ok: false, error: 'No file selected.' };
  const uploadForm = new FormData();
  uploadForm.set('file', file);
  const res = await fetch(`${SELF_URL}/api/brand/favicon`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminKey}` },
    body: uploadForm,
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    return { ok: false, error: detail ?? `Failed to upload favicon: ${res.status}` };
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
  return { ok: true, message: 'Favicon uploaded.' };
}
