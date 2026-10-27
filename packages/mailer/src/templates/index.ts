export { prepareBranding, renderEmail, EmailRenderError } from './render';
export type { EmailRenderErrorCode, EmailRequest, RenderedEmail } from './render';
export { resolveEmailCopy, SUPPORTED_EMAIL_LOCALES } from './copy';
export type {
  AccountCreatedCopy,
  EmailCopyByTemplate,
  EmailTemplateId,
  InviteCopy,
  MfaResetCopy,
  PasswordResetCopy,
  SupportedEmailLocale,
  VerifyEmailCopy,
} from './copy';
export { DEFAULT_PRIMARY_COLOR } from './branding';
export type { EmailBranding, EmailLocale } from './branding';
