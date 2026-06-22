import { NextResponse } from 'next/server';
import {
  DEFAULT_TENANT_ID,
  getEmailCopy,
  getInstanceConfig,
  type EmailTemplateId,
} from '@sovereignfs/db';
import {
  createMailer,
  renderInviteEmail,
  renderPasswordResetEmail,
  renderSubject,
  type EmailBranding,
} from '@sovereignfs/mailer';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';

const VALID_TEMPLATES = new Set<EmailTemplateId>(['passwordReset', 'invite']);

/**
 * POST /api/admin/email-templates/test
 *
 * Sends a sample email for the given template to the currently authenticated
 * admin's email address. Admin-key authenticated. The caller must also supply
 * the x-sovereign-user-email header (set automatically by middleware).
 * Body: { templateId }
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as { templateId?: string };
  const templateId = body.templateId as EmailTemplateId | undefined;

  if (!templateId || !VALID_TEMPLATES.has(templateId)) {
    return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 });
  }

  const toEmail = request.headers.get('x-sovereign-user-email');
  if (!toEmail) {
    return NextResponse.json({ error: 'No authenticated user' }, { status: 401 });
  }
  const pdb = await getPlatformDb();
  const [instanceConfig, overrides] = await Promise.all([
    getInstanceConfig(pdb, DEFAULT_TENANT_ID),
    getEmailCopy(pdb, DEFAULT_TENANT_ID, templateId),
  ]);

  const instanceUrlKey = 'SOVEREIGN_RUNTIME_PUBLIC_URL';
  const instanceUrl = process.env[instanceUrlKey] ?? 'http://localhost:3000';

  const branding: EmailBranding = {
    name: instanceConfig.emailFromName ?? instanceConfig.instanceName,
    logoUrl: instanceConfig.emailLogo ?? undefined,
    primaryColor: instanceConfig.instancePrimary ?? undefined,
    instanceUrl,
  };

  let html: string;
  let subject: string;
  if (templateId === 'passwordReset') {
    [html, subject] = await Promise.all([
      renderPasswordResetEmail(`${instanceUrl}/reset-password?token=preview`, branding, overrides),
      Promise.resolve(renderSubject('passwordReset', branding, overrides)),
    ]);
  } else {
    [html, subject] = await Promise.all([
      renderInviteEmail(`${instanceUrl}/register`, branding, overrides),
      Promise.resolve(renderSubject('invite', branding, overrides)),
    ]);
  }

  const mailer = createMailer();
  await mailer.send({ to: toEmail, subject: `[Test] ${subject}`, html });

  return NextResponse.json({ ok: true, to: toEmail });
}
