import { render } from '@react-email/render';
import { createElement } from 'react';
import enCopy from './locales/en.json';
import { InviteEmail } from './InviteEmail';
import { PasswordResetEmail } from './PasswordResetEmail';

export interface EmailBranding {
  /** Display name shown in the email header and subject interpolation. */
  name: string;
  /**
   * Absolute HTTPS URL to the instance logo. Must be publicly reachable —
   * data: URIs are blocked by Gmail, Outlook, and Apple Mail.
   * When undefined the header renders the instance name as text.
   */
  logoUrl?: string;
  /**
   * Hex colour (#rrggbb) used for CTA button backgrounds.
   * Defaults to #09090b (near-black) when undefined.
   */
  primaryColor?: string;
  /** Public base URL of the instance — shown in the email footer. */
  instanceUrl: string;
}

export type EmailCopyMap = typeof enCopy;

export type TemplateCopyOverrides = {
  passwordReset?: Partial<EmailCopyMap['passwordReset']>;
  invite?: Partial<EmailCopyMap['invite']>;
};

function interpolate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key as string] ?? '');
}

function applyVars<T extends Record<string, string>>(obj: T, vars: Record<string, string>): T {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, interpolate(v, vars)])) as T;
}

function resolvePasswordResetCopy(
  branding: EmailBranding,
  overrides?: Partial<EmailCopyMap['passwordReset']>,
): EmailCopyMap['passwordReset'] {
  const base = { ...enCopy.passwordReset, ...overrides };
  return applyVars(base, { brandName: branding.name });
}

function resolveInviteCopy(
  branding: EmailBranding,
  overrides?: Partial<EmailCopyMap['invite']>,
): EmailCopyMap['invite'] {
  const base = { ...enCopy.invite, ...overrides };
  return applyVars(base, { brandName: branding.name });
}

/**
 * Renders a password reset email to a CSS-inlined HTML string
 * ready for nodemailer's `html` option.
 */
export async function renderPasswordResetEmail(
  resetUrl: string,
  branding: EmailBranding,
  overrides?: Partial<EmailCopyMap['passwordReset']>,
): Promise<string> {
  const copy = resolvePasswordResetCopy(branding, overrides);
  return render(createElement(PasswordResetEmail, { resetUrl, branding, copy }), {
    pretty: false,
  });
}

/**
 * Renders a user invite email to a CSS-inlined HTML string
 * ready for nodemailer's `html` option.
 */
export async function renderInviteEmail(
  registerUrl: string,
  branding: EmailBranding,
  overrides?: Partial<EmailCopyMap['invite']>,
): Promise<string> {
  const copy = resolveInviteCopy(branding, overrides);
  return render(createElement(InviteEmail, { registerUrl, branding, copy }), { pretty: false });
}

/**
 * Renders the subject line for a given template, with branding interpolation
 * and any operator overrides applied.
 */
export function renderSubject(
  templateId: 'passwordReset' | 'invite',
  branding: EmailBranding,
  overrides?: { subject?: string },
): string {
  const raw = overrides?.subject ?? enCopy[templateId].subject;
  return interpolate(raw, { brandName: branding.name });
}
