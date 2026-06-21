'use server';

import { revalidatePath } from 'next/cache';
import { sdk } from '@sovereignfs/sdk';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Self-fetch address for the runtime's own admin API — the server always
// listens on :3000 (see plugins/actions.ts for the reverse-proxy rationale).
const SELF_URL = 'http://localhost:3000';

async function patchSettings(body: Record<string, unknown>): Promise<void> {
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
    throw new Error(detail ?? `Failed to update settings: ${res.status}`);
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
}

export async function updateTenantNameAction(formData: FormData): Promise<void> {
  const tenantName = (formData.get('tenantName') as string | null)?.trim();
  if (!tenantName) throw new Error('Tenant name is required.');
  await patchSettings({ tenantName });
}

export async function updateInviteOnlyAction(formData: FormData): Promise<void> {
  await patchSettings({ inviteOnly: formData.get('inviteOnly') === 'on' });
}

export async function updateRootPluginAction(formData: FormData): Promise<void> {
  const rootPluginId = formData.get('rootPluginId') as string | null;
  if (!rootPluginId) throw new Error('Select a plugin.');
  await patchSettings({ rootPluginId });
}

export async function updateBrandingAction(formData: FormData): Promise<void> {
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
    throw new Error('Primary colour must be a 6-digit hex value, e.g. #3b82f6.');
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
    throw new Error(detail ?? `Failed to update branding: ${res.status}`);
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
}

export async function uploadLogoAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const dark = formData.get('dark') === '1';
  const file = formData.get('file') as File | null;
  if (!file) throw new Error('No file provided.');
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
    throw new Error(detail ?? `Failed to upload logo: ${res.status}`);
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
}

export async function uploadFaviconAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const file = formData.get('file') as File | null;
  if (!file) throw new Error('No file provided.');
  const uploadForm = new FormData();
  uploadForm.set('file', file);
  const res = await fetch(`${SELF_URL}/api/brand/favicon`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminKey}` },
    body: uploadForm,
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(detail ?? `Failed to upload favicon: ${res.status}`);
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
}
