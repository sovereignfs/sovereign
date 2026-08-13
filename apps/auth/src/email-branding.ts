import type { EmailBranding } from '@sovereignfs/mailer';
import { getEnv } from './env';
import { runtimePublicUrl } from './runtime-url';

interface InstanceConfigResponse {
  instanceName: string;
  emailFromName: string | null;
  emailLogo: string | null;
  instancePrimary: string | null;
}

let brandingCache: { value: EmailBranding; expiresAt: number } | null = null;

/**
 * Resolves this instance's email branding via the runtime's
 * `/api/admin/instance-config` (apps/auth has its own DB, deliberately
 * separate from the runtime's — see docs/architecture-rules.md — so this is
 * a server-to-server HTTP call, not a direct DB read). Cached 60s; falls
 * back to plain "Sovereign" branding on any failure — a branding lookup
 * must never block sending the actual password reset email.
 */
export async function getEmailBranding(): Promise<EmailBranding> {
  if (brandingCache && Date.now() < brandingCache.expiresAt) return brandingCache.value;
  const env = getEnv();
  try {
    const res = await fetch(`${env.runtimeUrl}/api/admin/instance-config`, {
      headers: { Authorization: `Bearer ${env.adminKey}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as InstanceConfigResponse;
    const value: EmailBranding = {
      name: data.emailFromName?.trim() || data.instanceName,
      logoUrl: data.emailLogo ?? undefined,
      primaryColor: data.instancePrimary ?? undefined,
      instanceUrl: runtimePublicUrl(),
    };
    brandingCache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch {
    return { name: 'Sovereign', instanceUrl: runtimePublicUrl() };
  }
}

let copyCache: { value: Record<string, string>; expiresAt: number } | null = null;

/**
 * Resolves the fully-merged copy (built-in English strings + any operator
 * override from Console → Settings → Email Templates) for the password
 * reset email, via the runtime's `GET /api/admin/email-templates` — same
 * fetch/cache/fallback shape as `getEmailBranding`. Passed as `overrides`
 * into `renderPasswordResetEmail`, so every field "wins" as an override;
 * since it's already the fully-resolved value, this reproduces exactly what
 * Console's own preview/test-send shows. Returns an empty map (falls back
 * to packages/mailer's own built-in `en.json`) on any failure.
 */
export async function getPasswordResetCopy(): Promise<Record<string, string>> {
  if (copyCache && Date.now() < copyCache.expiresAt) return copyCache.value;
  const env = getEnv();
  try {
    const res = await fetch(
      `${env.runtimeUrl}/api/admin/email-templates?templateId=passwordReset&locale=en`,
      { headers: { Authorization: `Bearer ${env.adminKey}` } },
    );
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { copy: Record<string, string> };
    copyCache = { value: data.copy, expiresAt: Date.now() + 60_000 };
    return data.copy;
  } catch {
    return {};
  }
}
