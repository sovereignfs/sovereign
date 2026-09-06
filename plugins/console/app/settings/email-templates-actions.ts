'use server';

import { sdk } from '@sovereignfs/sdk';
import type { ActionResult } from './actions';
import { adminFetch } from '../_lib/admin-fetch';

export type { ActionResult } from './actions';

export type EmailTemplateId = 'passwordReset' | 'invite';

const EMAIL_TEMPLATE_IDS: readonly EmailTemplateId[] = ['passwordReset', 'invite'];
/** BCP 47-ish: `en`, `en-GB`, `pt-BR`. Anything else never reaches the API. */
const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

function isEmailTemplateId(value: unknown): value is EmailTemplateId {
  return typeof value === 'string' && (EMAIL_TEMPLATE_IDS as readonly string[]).includes(value);
}

function isLocale(value: unknown): value is string {
  return typeof value === 'string' && LOCALE_RE.test(value);
}

export async function getEmailTemplateCopyAction(
  templateId: EmailTemplateId,
  locale: string,
): Promise<{ ok: true; copy: Record<string, string> } | { ok: false; error: string }> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'instance:configure')) {
    return { ok: false, error: 'Insufficient privileges to view email templates.' };
  }
  if (!isEmailTemplateId(templateId) || !isLocale(locale)) {
    return { ok: false, error: 'Unknown email template or locale.' };
  }
  const query = new URLSearchParams({ templateId, locale });
  const res = await adminFetch(`/api/admin/email-templates?${query.toString()}`);
  if (!res.ok) return { ok: false, error: `Failed to load copy: ${res.status}` };
  const data = (await res.json()) as { copy: Record<string, string> };
  return { ok: true, copy: data.copy };
}

/**
 * Saves every changed copy field for one template/locale. The runtime's
 * PATCH route writes one field at a time (platform_settings is a flat K-V
 * store); this loops so the Console form can present all fields as a single
 * "Save" action.
 */
export async function saveEmailTemplateCopyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'instance:configure')) {
    return { ok: false, error: 'Insufficient privileges to change email templates.' };
  }
  const templateId = formData.get('templateId');
  const locale = formData.get('locale');
  if (!templateId || !locale) return { ok: false, error: 'templateId and locale are required.' };
  if (!isEmailTemplateId(templateId) || !isLocale(locale)) {
    return { ok: false, error: 'Unknown email template or locale.' };
  }

  const fields = Array.from(formData.keys()).filter(
    (key) => key !== 'templateId' && key !== 'locale',
  );
  for (const field of fields) {
    const value = (formData.get(field) as string | null) ?? '';
    const res = await adminFetch('/api/admin/email-templates', {
      method: 'PATCH',
      body: JSON.stringify({ templateId, locale, field, value }),
    });
    if (!res.ok) {
      const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
      return { ok: false, error: detail ?? `Failed to save "${field}": ${res.status}` };
    }
  }
  return { ok: true, message: 'Email template copy saved.' };
}

export async function testSendEmailTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, 'instance:configure')) {
    return { ok: false, error: 'Insufficient privileges to send a test email.' };
  }
  const templateId = formData.get('templateId');
  const locale = formData.get('locale');
  if (!templateId || !locale) return { ok: false, error: 'templateId and locale are required.' };
  if (!isEmailTemplateId(templateId) || !isLocale(locale)) {
    return { ok: false, error: 'Unknown email template or locale.' };
  }

  const res = await adminFetch('/api/admin/email-templates/test', {
    method: 'POST',
    body: JSON.stringify({
      templateId,
      locale,
      toEmail: session.user.email,
      actorUserId: session.user.id,
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    status?: 'skipped' | 'sent' | 'failed';
    errorCode?: string;
    error?: string;
  } | null;
  if (!res.ok || data?.status === 'failed') {
    return {
      ok: false,
      error: data?.errorCode ?? data?.error ?? `Test send failed: ${res.status}`,
    };
  }
  if (data?.status === 'skipped') {
    return { ok: false, error: 'SMTP is not configured — nothing was sent.' };
  }
  return { ok: true, message: `Test email sent to ${session.user.email}.` };
}
