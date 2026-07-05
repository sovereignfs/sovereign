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
  // 'layout' scope revalidates the shared platform shell (sidebar/launcher) too —
  // settings like the example-plugins toggle and root plugin change what it shows.
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Saved.' };
}

export async function updateTenantNameAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const tenantName = (formData.get('tenantName') as string | null)?.trim();
  if (!tenantName) return { ok: false, error: 'Instance name is required.' };
  return patchSettings({ tenantName });
}

export async function updateInviteOnlyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return patchSettings({ inviteOnly: formData.get('inviteOnly') === 'on' });
}

export async function updateExampleAppsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return patchSettings({ examplesEnabled: formData.get('examplesEnabled') === 'on' });
}

export async function updateRootPluginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const rootPluginId = formData.get('rootPluginId') as string | null;
  if (!rootPluginId) return { ok: false, error: 'Select a plugin.' };
  return patchSettings({ rootPluginId });
}

export async function updateInstanceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';

  const instanceName = (formData.get('instanceName') as string | null)?.trim() || null;
  const instancePrimary = (formData.get('instancePrimary') as string | null)?.trim() || null;
  const instanceLogo = (formData.get('instanceLogo') as string | null)?.trim() || null;
  const instanceLogoDark = (formData.get('instanceLogoDark') as string | null)?.trim() || null;
  const instanceFavicon = (formData.get('instanceFavicon') as string | null)?.trim() || null;
  const emailFromName = (formData.get('emailFromName') as string | null)?.trim() || null;
  const emailLogo = (formData.get('emailLogo') as string | null)?.trim() || null;

  if (instancePrimary && !HEX_COLOR_RE.test(instancePrimary)) {
    return { ok: false, error: 'Primary colour must be a 6-digit hex value, e.g. #3b82f6.' };
  }

  const body = {
    instanceName,
    instancePrimary,
    instanceLogo,
    instanceLogoDark,
    instanceFavicon,
    emailFromName,
    emailLogo,
  };
  const res = await fetch(`${SELF_URL}/api/admin/instance-config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    return { ok: false, error: detail ?? `Failed to update instance identity: ${res.status}` };
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
  return { ok: true, message: 'Instance identity saved.' };
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
  const url = `${SELF_URL}/api/instance/logo${dark ? '?dark=1' : ''}`;
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
  const res = await fetch(`${SELF_URL}/api/instance/favicon`, {
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

export async function saveProviderConfigAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const pluginId = formData.get('pluginId') as string | null;
  const provider = formData.get('provider') as string | null;
  if (!pluginId || !provider) return { ok: false, error: 'Provider identity is missing.' };

  const publicValues: Record<string, string> = {};
  const secretValues: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    if (key.startsWith('public:')) publicValues[key.slice('public:'.length)] = value;
    if (key.startsWith('secret:')) secretValues[key.slice('secret:'.length)] = value;
  }

  const res = await fetch(`${SELF_URL}/api/admin/provider-configs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ pluginId, provider, publicValues, secretValues }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    return { ok: false, error: detail ?? `Failed to save provider config: ${res.status}` };
  }
  revalidatePath('/console/settings');
  return { ok: true, message: 'Provider config saved.' };
}

export async function testProviderConfigAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const id = formData.get('id') as string | null;
  if (!id) return { ok: false, error: 'Save the provider config before testing.' };
  const res = await fetch(`${SELF_URL}/api/admin/provider-configs/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok || body?.error) {
    return { ok: false, error: body?.error ?? `Provider config test failed: ${res.status}` };
  }
  revalidatePath('/console/settings');
  return { ok: true, message: 'Provider config test passed.' };
}

export async function deleteProviderConfigAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const id = formData.get('id') as string | null;
  if (!id) return { ok: false, error: 'No saved provider config to remove.' };
  const res = await fetch(`${SELF_URL}/api/admin/provider-configs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    return { ok: false, error: detail ?? `Failed to remove provider config: ${res.status}` };
  }
  revalidatePath('/console/settings');
  return { ok: true, message: 'Provider config removed.' };
}
