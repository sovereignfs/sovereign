import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID, setEmailCopy, type EmailTemplateId } from '@sovereignfs/db';
import { SUPPORTED_EMAIL_LOCALES } from '@sovereignfs/mailer';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';
import { resolveMergedEmailCopy } from '@/src/email-templates';

const TEMPLATE_IDS: readonly EmailTemplateId[] = ['passwordReset', 'invite'];

function isTemplateId(value: string | null): value is EmailTemplateId {
  return !!value && (TEMPLATE_IDS as readonly string[]).includes(value);
}

function isLocale(value: string | null): value is string {
  return !!value && (SUPPORTED_EMAIL_LOCALES as readonly string[]).includes(value);
}

/**
 * GET /api/admin/email-templates?templateId=&locale=
 *
 * Returns the merged copy (built-in strings + operator overrides) for one
 * template/locale — the values the Console Email Templates section edits.
 * Admin-key authenticated (called from Console server actions).
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const templateId = url.searchParams.get('templateId');
  const locale = url.searchParams.get('locale') ?? 'en';
  if (!isTemplateId(templateId)) {
    return NextResponse.json(
      { error: `templateId must be one of ${TEMPLATE_IDS.join(', ')}` },
      { status: 400 },
    );
  }
  if (!isLocale(locale)) {
    return NextResponse.json(
      { error: `locale must be one of ${SUPPORTED_EMAIL_LOCALES.join(', ')}` },
      { status: 400 },
    );
  }

  const pdb = await getPlatformDb();
  const copy = await resolveMergedEmailCopy(pdb, templateId, locale);
  return NextResponse.json({ copy });
}

interface PatchBody {
  templateId?: string;
  locale?: string;
  field?: string;
  value?: string;
}

/**
 * PATCH /api/admin/email-templates
 *
 * Writes a single copy field override. Admin-key authenticated.
 */
export async function PATCH(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const templateId = body?.templateId ?? null;
  const locale = body?.locale ?? null;
  const { field, value } = body ?? {};
  if (!isTemplateId(templateId)) {
    return NextResponse.json(
      { error: `templateId must be one of ${TEMPLATE_IDS.join(', ')}` },
      { status: 400 },
    );
  }
  if (!isLocale(locale)) {
    return NextResponse.json(
      { error: `locale must be one of ${SUPPORTED_EMAIL_LOCALES.join(', ')}` },
      { status: 400 },
    );
  }
  if (typeof field !== 'string' || typeof value !== 'string') {
    return NextResponse.json({ error: 'field and value are required' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  try {
    await setEmailCopy(pdb, DEFAULT_TENANT_ID, templateId, locale, field, value);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const actorId = request.headers.get('x-sovereign-user-id');
  void logActivity({
    actorId,
    actorType: 'user',
    action: 'settings.email_copy_changed',
    visibility: 'admin',
    summary: `Email template copy updated: ${templateId}.${field} (${locale})`,
    metadata: { templateId, locale, field },
  });

  const copy = await resolveMergedEmailCopy(pdb, templateId, locale);
  return NextResponse.json({ copy });
}
