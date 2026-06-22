import { NextResponse } from 'next/server';
import {
  DEFAULT_TENANT_ID,
  getEmailCopy,
  setEmailCopy,
  type EmailTemplateId,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';

const VALID_TEMPLATES = new Set<EmailTemplateId>(['passwordReset', 'invite']);

/**
 * GET /api/admin/email-templates?templateId=&
 *
 * Returns operator copy overrides for a template (en locale only).
 * Admin-key authenticated.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get('templateId') as EmailTemplateId | null;

  if (!templateId || !VALID_TEMPLATES.has(templateId)) {
    return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  const copy = await getEmailCopy(pdb, DEFAULT_TENANT_ID, templateId);
  return NextResponse.json({ copy });
}

/**
 * PATCH /api/admin/email-templates
 *
 * Upserts a single copy field override.
 * Body: { templateId, field, value }
 * Admin-key authenticated.
 */
export async function PATCH(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    templateId?: string;
    field?: string;
    value?: string;
  };

  const { templateId, field, value } = body;

  if (!templateId || !VALID_TEMPLATES.has(templateId as EmailTemplateId)) {
    return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 });
  }
  if (!field || typeof field !== 'string') {
    return NextResponse.json({ error: 'field is required' }, { status: 400 });
  }
  if (typeof value !== 'string') {
    return NextResponse.json({ error: 'value must be a string' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  try {
    await setEmailCopy(pdb, DEFAULT_TENANT_ID, templateId as EmailTemplateId, field, value);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
