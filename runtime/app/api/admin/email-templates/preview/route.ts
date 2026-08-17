import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_EMAIL_LOCALES } from '@sovereignfs/mailer';
import type { EmailTemplateId } from '@sovereignfs/db';
import { hasCapability } from '@/src/capabilities';
import { getPlatformDb } from '@/src/db';
import { renderEmailForUrl, SAMPLE_EMAIL_URLS } from '@/src/email-templates';
import { verifySession } from '@/src/middleware/session';

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
 * `<iframe>`. Reflects the currently SAVED copy overrides (same source the
 * actual send path reads) — an unsaved in-progress form edit isn't previewed
 * live.
 *
 * Authorization is by the **real signed session cookie**, verified in-route via
 * `verifySession`, then an `instance:configure` capability check — NOT the
 * admin key (a browser can't attach an Authorization header to an iframe
 * `src`) and NOT the `x-sovereign-user-role` header (the middleware matcher
 * excludes `/api/admin`, so on this path that header is never
 * platform-injected and never stripped — it would be caller-forgeable). This
 * route is deliberately kept off the middleware surface: a middleware-applied
 * `frame-ancestors 'none'` on this HTML response would stop the Console
 * settings page from framing it.
 */
export async function GET(request: Request): Promise<Response> {
  const verified = await verifySession(new NextRequest(request));
  if (!verified || !hasCapability(verified.session.user.role, 'instance:configure')) {
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
