import {
  DEFAULT_TENANT_ID,
  getEmailCopy,
  getInstanceConfig,
  type EmailTemplateId,
} from '@sovereignfs/db';
import {
  renderInviteEmail,
  renderPasswordResetEmail,
  type EmailBranding,
} from '@sovereignfs/mailer';
import { getPlatformDb } from '@/src/db';

const VALID_TEMPLATES = new Set<EmailTemplateId>(['passwordReset', 'invite']);

/**
 * GET /api/admin/email-templates/preview?templateId=
 *
 * Returns a rendered HTML preview of the email template using the current
 * instance config and any copy overrides. Returns text/html (sandboxed iframe).
 * Session-gated via middleware (admin role required).
 */
export async function GET(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role') ?? '';
  if (!role.startsWith('platform:admin')) {
    return new Response('Forbidden', { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get('templateId') as EmailTemplateId | null;

  if (!templateId || !VALID_TEMPLATES.has(templateId)) {
    return new Response('Invalid templateId', { status: 400 });
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

  const html =
    templateId === 'passwordReset'
      ? await renderPasswordResetEmail(
          `${instanceUrl}/reset-password?token=preview`,
          branding,
          overrides,
        )
      : await renderInviteEmail(`${instanceUrl}/register`, branding, overrides);

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
