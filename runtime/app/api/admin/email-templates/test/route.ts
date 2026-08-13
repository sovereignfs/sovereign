import { NextResponse } from 'next/server';
import type { EmailTemplateId } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { sendPlatformEmail } from '@/src/platform-email';
import { renderEmailForUrl, SAMPLE_EMAIL_URLS } from '@/src/email-templates';

const TEMPLATE_IDS: readonly EmailTemplateId[] = ['passwordReset', 'invite'];

function isTemplateId(value: unknown): value is EmailTemplateId {
  return typeof value === 'string' && (TEMPLATE_IDS as readonly string[]).includes(value);
}

interface TestSendBody {
  templateId?: string;
  locale?: string;
  /** The caller's own email address — Console passes the requesting admin's. */
  toEmail?: string;
  actorUserId?: string | null;
}

/**
 * POST /api/admin/email-templates/test
 *
 * Sends a sample of the given template — with a placeholder link, never a
 * real reset/invite token — to `toEmail`. Admin-key authenticated; the
 * caller (Console's server action) supplies the requesting admin's own
 * address, since this route has no session context of its own.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as TestSendBody | null;
  const templateId = body?.templateId;
  const locale = body?.locale ?? 'en';
  const toEmail = body?.toEmail;
  if (!isTemplateId(templateId)) {
    return NextResponse.json(
      { error: `templateId must be one of ${TEMPLATE_IDS.join(', ')}` },
      { status: 400 },
    );
  }
  if (!toEmail) {
    return NextResponse.json({ error: 'toEmail is required' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  const { subject, html } = await renderEmailForUrl(
    pdb,
    templateId,
    SAMPLE_EMAIL_URLS[templateId],
    locale,
  );

  const result = await sendPlatformEmail({
    templateId: `console.email_template_test.${templateId}`,
    deliveryClass: 'administrative',
    toEmail,
    actorUserId: body?.actorUserId ?? null,
    source: 'console',
    subject: `[Test] ${subject}`,
    html,
    metadata: { templateId, locale, test: true },
  });

  return NextResponse.json(result, { status: result.status === 'failed' ? 502 : 200 });
}
