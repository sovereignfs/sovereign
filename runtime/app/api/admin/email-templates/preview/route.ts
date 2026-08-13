import { NextResponse } from 'next/server';
import { SUPPORTED_EMAIL_LOCALES } from '@sovereignfs/mailer';
import type { EmailTemplateId } from '@sovereignfs/db';
import { hasCapability } from '@/src/capabilities';
import { getPlatformDb } from '@/src/db';
import { renderEmailForUrl, SAMPLE_EMAIL_URLS } from '@/src/email-templates';

const TEMPLATE_IDS: readonly EmailTemplateId[] = ['passwordReset', 'invite'];

function isTemplateId(value: string | null): value is EmailTemplateId {
  return !!value && (TEMPLATE_IDS as readonly string[]).includes(value);
}

function isLocale(value: string | null): value is string {
  return !!value && (SUPPORTED_EMAIL_LOCALES as readonly string[]).includes(value);
}

/**
 * GET /api/admin/email-templates/preview?templateId=&locale=
 *
 * Rendered HTML preview for the Console Email Templates section's sandboxed
 * `<iframe>`. Session-gated via `x-sovereign-user-role` (not the raw admin
 * key) — a browser can't attach an Authorization header to an iframe `src`.
 * Reflects the currently SAVED copy overrides (same source the actual send
 * path reads) — an unsaved in-progress form edit isn't previewed live.
 */
export async function GET(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role') ?? '';
  if (!hasCapability(role, 'instance:configure')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const templateId = url.searchParams.get('templateId');
  const locale = url.searchParams.get('locale') ?? 'en';
  if (!isTemplateId(templateId) || !isLocale(locale)) {
    return NextResponse.json({ error: 'invalid templateId or locale' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  const { html } = await renderEmailForUrl(pdb, templateId, SAMPLE_EMAIL_URLS[templateId], locale);

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
