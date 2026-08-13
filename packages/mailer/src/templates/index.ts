import { render } from '@react-email/render';
import { createElement } from 'react';
import type { EmailBranding, EmailLocale } from './branding';
import { interpolate, resolveEmailCopy, type EmailTemplateId } from './copy';
import { InviteEmail } from './InviteEmail';
import { PasswordResetEmail } from './PasswordResetEmail';

export type {
  EmailCopyByTemplate,
  EmailTemplateId,
  InviteCopy,
  PasswordResetCopy,
  SupportedEmailLocale,
} from './copy';
export { resolveEmailCopy, SUPPORTED_EMAIL_LOCALES } from './copy';
export type { EmailBranding, EmailLocale } from './branding';

function interpolateAll<T extends Record<keyof T, string>>(
  copy: T,
  vars: Record<string, string>,
): T {
  return Object.fromEntries(
    Object.entries(copy).map(([key, value]) => [key, interpolate(value as string, vars)]),
  ) as T;
}

/**
 * Renders a password reset email.
 * @returns CSS-inlined HTML string, ready for nodemailer's `html` option.
 */
export async function renderPasswordResetEmail(
  resetUrl: string,
  branding: EmailBranding,
  locale?: EmailLocale,
): Promise<string> {
  const copy = interpolateAll(
    resolveEmailCopy('passwordReset', locale?.locale ?? 'en', locale?.overrides),
    { brandName: branding.name },
  );
  return render(createElement(PasswordResetEmail, { resetUrl, branding, copy }), {
    pretty: false,
  });
}

/**
 * Renders a user invite email.
 * @returns CSS-inlined HTML string, ready for nodemailer's `html` option.
 */
export async function renderInviteEmail(
  registerUrl: string,
  branding: EmailBranding,
  locale?: EmailLocale,
): Promise<string> {
  const copy = interpolateAll(
    resolveEmailCopy('invite', locale?.locale ?? 'en', locale?.overrides),
    {
      brandName: branding.name,
    },
  );
  return render(createElement(InviteEmail, { registerUrl, branding, copy }), { pretty: false });
}

/**
 * Renders the subject line for a given template. Subject interpolation is a
 * subset of copy customisation resolved separately from the HTML body —
 * nodemailer's `subject` option is plain text, not part of the render tree.
 */
export function renderSubject(
  templateId: EmailTemplateId,
  branding: EmailBranding,
  locale?: EmailLocale,
): string {
  const copy = resolveEmailCopy(templateId, locale?.locale ?? 'en', locale?.overrides);
  return interpolate(copy.subject, { brandName: branding.name });
}
