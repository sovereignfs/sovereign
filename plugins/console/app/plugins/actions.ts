'use server';

import { revalidatePath } from 'next/cache';
import { sdk } from '@sovereignfs/sdk';

// Self-fetch address for the runtime's own admin API — the server always
// listens on :3000, and the public URL may sit behind a reverse proxy the
// container cannot hairpin through.
const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  return fetch(`${SELF_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
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
