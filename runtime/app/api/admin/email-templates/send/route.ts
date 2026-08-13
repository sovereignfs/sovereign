import { NextResponse } from 'next/server';
import type { EmailTemplateId } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { sendPlatformEmail, type PlatformEmailSource } from '@/src/platform-email';
import { renderEmailForUrl } from '@/src/email-templates';

const TEMPLATE_IDS: readonly EmailTemplateId[] = ['passwordReset', 'invite'];

function isTemplateId(value: unknown): value is EmailTemplateId {
  return typeof value === 'string' && (TEMPLATE_IDS as readonly string[]).includes(value);
}

interface SendBody {
  templateId?: string;
  locale?: string;
  toEmail?: string;
  toUserId?: string | null;
  actorUserId?: string | null;
  /** The real reset/register URL, including token — never a sample. */
  url?: string;
  source?: PlatformEmailSource;
}

/**
 * POST /api/admin/email-templates/send
 *
 * Renders a template with the given real URL and branding/copy, then sends
 * it. Admin-key authenticated — the only route through which a plugin (e.g.
 * Console's invite action) can reach the branded mailer templates, since the
 * SDK boundary rule blocks plugins from importing `@sovereignfs/mailer` or
 * `@sovereignfs/db` directly. `apps/auth`'s password reset email does NOT
 * go through this route — apps/auth is not a plugin and renders directly
 * (see apps/auth/src/auth.ts's `sendResetPassword` hook).
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as SendBody | null;
  const templateId = body?.templateId;
  const locale = body?.locale ?? 'en';
  const toEmail = body?.toEmail;
  const url = body?.url;
  if (!isTemplateId(templateId)) {
    return NextResponse.json(
      { error: `templateId must be one of ${TEMPLATE_IDS.join(', ')}` },
      { status: 400 },
    );
  }
  if (!toEmail || !url) {
    return NextResponse.json({ error: 'toEmail and url are required' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  const { subject, html } = await renderEmailForUrl(pdb, templateId, url, locale);

  const result = await sendPlatformEmail({
    templateId: `${body?.source ?? 'console'}.${templateId}`,
    deliveryClass: templateId === 'passwordReset' ? 'authentication' : 'administrative',
    toEmail,
    toUserId: body?.toUserId ?? null,
    actorUserId: body?.actorUserId ?? null,
    source: body?.source ?? 'console',
    subject,
    html,
    metadata: { templateId, locale },
  });

  return NextResponse.json(result, { status: result.status === 'failed' ? 502 : 200 });
}
