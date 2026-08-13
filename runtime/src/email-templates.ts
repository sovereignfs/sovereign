import {
  DEFAULT_TENANT_ID,
  getEmailCopy,
  getInstanceConfig,
  type EmailTemplateId,
  type PlatformDb,
} from '@sovereignfs/db';
import {
  renderInviteEmail,
  renderPasswordResetEmail,
  renderSubject,
  resolveEmailCopy,
  type EmailBranding,
} from '@sovereignfs/mailer';
import { instancePublicUrl } from './instance-url';

export type { EmailTemplateId };

/** Sample URLs used for the Console preview panel and test-send — never a real token. */
export const SAMPLE_EMAIL_URLS: Record<EmailTemplateId, string> = {
  passwordReset: `${instancePublicUrl()}/reset-password?token=sample-token`,
  invite: `${instancePublicUrl()}/register?token=sample-token`,
};

/** Resolves the current instance's email branding (name, logo, colour, URL). */
export async function resolveEmailBranding(pdb: PlatformDb): Promise<EmailBranding> {
  const config = await getInstanceConfig(pdb, DEFAULT_TENANT_ID);
  return {
    name: config.emailFromName?.trim() || config.instanceName,
    logoUrl: config.emailLogo ?? undefined,
    primaryColor: config.instancePrimary ?? undefined,
    instanceUrl: instancePublicUrl(),
  };
}

/**
 * Merges built-in locale copy (packages/mailer) with operator overrides
 * (platform_settings, via packages/db) for one template/locale — the full
 * resolved view the Console Email Templates section edits and previews.
 */
export async function resolveMergedEmailCopy(
  pdb: PlatformDb,
  templateId: EmailTemplateId,
  locale: string,
): Promise<Record<string, string>> {
  const overrides = await getEmailCopy(pdb, DEFAULT_TENANT_ID, templateId, locale);
  // resolveEmailCopy's return type is keyed to the specific templateId literal
  // (PasswordResetCopy | InviteCopy); this function intentionally widens to a
  // loose string map for the admin API layer, which is field-name-agnostic.
  return resolveEmailCopy(templateId, locale, overrides) as unknown as Record<string, string>;
}

/**
 * Renders one template for a specific link (a real reset/invite URL, or a
 * SAMPLE_EMAIL_URLS placeholder for preview/test-send) — branding and
 * operator copy overrides resolved fresh from the DB. The one place that
 * knows how to turn a (templateId, url) pair into a subject + HTML body;
 * used by the Console-facing send/test/preview routes below, and by plugins
 * that need a branded email but (per the SDK boundary rule) cannot import
 * @sovereignfs/mailer or @sovereignfs/db directly — e.g. Console's invite
 * action, which reaches this through POST /api/admin/email-templates/send.
 */
export async function renderEmailForUrl(
  pdb: PlatformDb,
  templateId: EmailTemplateId,
  url: string,
  locale: string,
): Promise<{ subject: string; html: string }> {
  const [branding, overrides] = await Promise.all([
    resolveEmailBranding(pdb),
    getEmailCopy(pdb, DEFAULT_TENANT_ID, templateId, locale),
  ]);
  const localeInput = { locale, overrides };
  const html =
    templateId === 'passwordReset'
      ? await renderPasswordResetEmail(url, branding, localeInput)
      : await renderInviteEmail(url, branding, localeInput);
  const subject = renderSubject(templateId, branding, localeInput);
  return { subject, html };
}
