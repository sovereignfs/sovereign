import type { EmailBranding } from '@sovereignfs/mailer';

interface InstanceConfigResponse {
  instanceName: string;
  emailFromName: string | null;
  emailLogo: string | null;
  instancePrimary: string | null;
}

let cached: { value: EmailBranding; expiresAt: number } | null = null;

/**
 * Returns email branding fetched from the runtime's instance config API.
 * Cached for 60 seconds so the auth server isn't slowed by each password reset.
 * Falls back to Sovereign defaults when the runtime is unreachable — the
 * password reset email must still send even if the runtime is temporarily down.
 */
export async function getBranding(): Promise<EmailBranding> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const baseUrl = process.env.AUTH_BASE_URL || 'http://localhost:3001';
  const runtimeInternalUrlKey = 'SOVEREIGN_RUNTIME_INTERNAL_URL';
  const runtimeUrl = process.env[runtimeInternalUrlKey] ?? 'http://localhost:3000';
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';

  try {
    const res = await fetch(`${runtimeUrl}/api/admin/instance-config`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as InstanceConfigResponse;
    const value: EmailBranding = {
      name: data.emailFromName ?? data.instanceName,
      logoUrl: data.emailLogo ?? undefined,
      primaryColor: data.instancePrimary ?? undefined,
      instanceUrl: baseUrl,
    };
    cached = { value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch {
    // Graceful fallback — auth must send the email even if runtime is temporarily down.
    return { name: 'Sovereign', instanceUrl: baseUrl };
  }
}

/** Clears the in-process branding cache. Tests call this between cases. */
export function clearBrandingCache(): void {
  cached = null;
}
