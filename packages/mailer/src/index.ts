export { createMailer, createUnavailableMailer } from './mailer.js';
export { createSmtpTransport, SMTP_TIMEOUTS_MS } from './smtp.js';
export type { SmtpTransportOptions } from './smtp.js';
export { createMemoryTransport } from './memory.js';
export type { MemoryTransport } from './memory.js';
export { DEFAULT_SMTP_PORT, describeSmtpProblem, resolveSmtp } from './smtp-config.js';
export type { SmtpInput, SmtpStatus } from './smtp-config.js';
export { isMailError, MailError } from './errors.js';
export type { MailErrorCode } from './errors.js';
export { isEmailAddress, isSender } from './address.js';
export type {
  ComposedMessage,
  Mailer,
  MailMessage,
  SentMail,
  SmtpSettings,
  Transport,
} from './types.js';

export {
  DEFAULT_PRIMARY_COLOR,
  EmailRenderError,
  prepareBranding,
  renderEmail,
  resolveEmailCopy,
  SUPPORTED_EMAIL_LOCALES,
} from './templates/index';
export type {
  EmailBranding,
  EmailCopyByTemplate,
  EmailLocale,
  EmailRenderErrorCode,
  EmailRequest,
  EmailTemplateId,
  RenderedEmail,
  SupportedEmailLocale,
} from './templates/index';
