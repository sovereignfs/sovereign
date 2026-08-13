export { createMailer } from './mailer';
export type { Mailer, MailerConfig, MailOptions } from './types';

export {
  renderInviteEmail,
  renderPasswordResetEmail,
  renderSubject,
  resolveEmailCopy,
  SUPPORTED_EMAIL_LOCALES,
} from './templates/index';
export type {
  EmailBranding,
  EmailCopyByTemplate,
  EmailLocale,
  EmailTemplateId,
  InviteCopy,
  PasswordResetCopy,
  SupportedEmailLocale,
} from './templates/index';
