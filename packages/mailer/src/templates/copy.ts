import en from './locales/en.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };
import si from './locales/si.json' with { type: 'json' };
import ta from './locales/ta.json' with { type: 'json' };

export interface PasswordResetCopy {
  subject: string;
  intro: string;
  cta: string;
  expiry: string;
  ignore: string;
}

export interface InviteCopy {
  subject: string;
  intro: string;
  cta: string;
  /** Used only when the invitation has an expiry; `{{expires}}` is its date. */
  expiry: string;
  ignore: string;
}

export interface VerifyEmailCopy {
  subject: string;
  intro: string;
  cta: string;
  expiry: string;
  ignore: string;
}

export interface AccountCreatedCopy {
  subject: string;
  /** Used only when the person's name is known; `{{name}}` is it. */
  greeting: string;
  intro: string;
  cta: string;
  ignore: string;
}

export interface MfaResetCopy {
  subject: string;
  intro: string;
  next: string;
  cta: string;
  ignore: string;
}

/** The words around a message an app wrote (core-app §4.2): everything else in it is the app's. */
export interface AppMessageCopy {
  /** The line under the instance's name: `{{appName}}`, `{{brandName}}`. */
  fromApp: string;
  /** The button's label, when the message has a link. */
  cta: string;
  why: string;
  stop: string;
  /** What the link to the person's email switches is called. */
  manage: string;
}

export interface EmailCopyByTemplate {
  passwordReset: PasswordResetCopy;
  invite: InviteCopy;
  verifyEmail: VerifyEmailCopy;
  accountCreated: AccountCreatedCopy;
  mfaReset: MfaResetCopy;
  appMessage: AppMessageCopy;
}

export type EmailTemplateId = keyof EmailCopyByTemplate;

/** BCP 47 locale tags with a built-in translation. 'en' is the required fallback. */
export const SUPPORTED_EMAIL_LOCALES = ['en', 'de', 'si', 'ta'] as const;
export type SupportedEmailLocale = (typeof SUPPORTED_EMAIL_LOCALES)[number];

// A translation may be partial: a template or a line it lacks falls back to English.
const BUILTIN_LOCALES: Record<SupportedEmailLocale, Partial<EmailCopyByTemplate>> = {
  en,
  de,
  si,
  ta,
} as unknown as Record<SupportedEmailLocale, Partial<EmailCopyByTemplate>>;

function isSupportedLocale(locale: string): locale is SupportedEmailLocale {
  return (SUPPORTED_EMAIL_LOCALES as readonly string[]).includes(locale);
}

/**
 * Resolves the merged copy for one template: operator override → built-in
 * `{locale}.json` → built-in `en.json`. Any field absent from an override or
 * a non-English locale falls through to the next source, so a locale file
 * can be partial without breaking rendering.
 */
export function resolveEmailCopy<T extends EmailTemplateId>(
  templateId: T,
  locale: string,
  overrides?: Partial<Record<string, string>>,
): EmailCopyByTemplate[T] {
  const localeCopy = isSupportedLocale(locale) ? BUILTIN_LOCALES[locale][templateId] : undefined;
  const enCopy = BUILTIN_LOCALES.en[templateId];
  return { ...enCopy, ...localeCopy, ...overrides } as EmailCopyByTemplate[T];
}

/** Replaces `{{var}}` placeholders. Unknown variables are left as empty strings. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}
