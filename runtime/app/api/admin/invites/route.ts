import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID, getEmailCopy, getInstanceConfig } from '@sovereignfs/db';
import {
  createMailer,
  renderInviteEmail,
  renderSubject,
  type EmailBranding,
} from '@sovereignfs/mailer';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';

/**
 * POST /api/admin/invites
 *
 * Proxies invite token creation to the auth server, then sends a branded
 * invite email. Admin-key authenticated.
 *
 * Body: { email: string; expiresInDays?: number; registerUrl?: string }
 * Returns: { token, email } on success.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    email?: string;
    expiresInDays?: number;
    registerUrl?: string;
  };

  if (!body.email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const authUrl = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';

  const authRes = await fetch(`${authUrl}/api/admin/invites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
      Origin: authUrl,
    },
    body: JSON.stringify({ email: body.email, expiresInDays: body.expiresInDays }),
  });

  if (!authRes.ok) {
    const detail = ((await authRes.json().catch(() => null)) as { error?: string } | null)?.error;
    return NextResponse.json(
      { error: detail ?? `Invite creation failed: ${authRes.status}` },
      { status: authRes.status },
    );
  }

  const invite = (await authRes.json()) as { token: string; email: string };

  const instanceUrlKey = 'SOVEREIGN_RUNTIME_PUBLIC_URL';
  const instanceUrl = process.env[instanceUrlKey] ?? 'http://localhost:3000';
  const registerUrl = body.registerUrl ?? `${instanceUrl}/register`;

  try {
    const pdb = await getPlatformDb();
    const [instanceConfig, overrides] = await Promise.all([
      getInstanceConfig(pdb, DEFAULT_TENANT_ID),
      getEmailCopy(pdb, DEFAULT_TENANT_ID, 'invite'),
    ]);

    const branding: EmailBranding = {
      name: instanceConfig.emailFromName ?? instanceConfig.instanceName,
      logoUrl: instanceConfig.emailLogo ?? undefined,
      primaryColor: instanceConfig.instancePrimary ?? undefined,
      instanceUrl,
    };

    const [html, subject] = await Promise.all([
      renderInviteEmail(registerUrl, branding, overrides),
      Promise.resolve(renderSubject('invite', branding, overrides)),
    ]);

    const mailer = createMailer();
    await mailer.send({ to: invite.email, subject, html });
  } catch {
    // Email failure must not block the invite — the token is already created.
    // The admin can resend manually.
  }

  return NextResponse.json(invite, { status: 201 });
}
