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
  expiry: string;
}

export interface EmailCopyByTemplate {
  passwordReset: PasswordResetCopy;
  invite: InviteCopy;
}

export type EmailTemplateId = keyof EmailCopyByTemplate;

/** BCP 47 locale tags with a built-in translation. 'en' is the required fallback. */
export const SUPPORTED_EMAIL_LOCALES = ['en', 'de', 'si', 'ta'] as const;
export type SupportedEmailLocale = (typeof SUPPORTED_EMAIL_LOCALES)[number];

const BUILTIN_LOCALES: Record<SupportedEmailLocale, EmailCopyByTemplate> = { en, de, si, ta };

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
