import type { Environment, Suite } from './types.js';

export const ENVIRONMENTS: readonly Environment[] = ['development', 'staging', 'production'];

/** What an instance is for (spec/suite.md §1.1). An instance that does not say is production, so a file written before this existed means what it did. */
export const environmentOf = (suite: Suite): Environment => suite.environment ?? 'production';

/** Where core sends mail when nothing else is set: Mailpit's SMTP port, on core's network, which takes mail from anyone and sends none. */
export const MAIL_HOST = 'sv-mailpit';
export const MAIL_SMTP_PORT = 1025;
/** Mailpit's inbox, which a development or staging server publishes on its own loopback address and nowhere else. */
export const MAIL_UI_PORT = 8025;

/**
 * Whether the instance runs Mailpit: it is not production, and the operator has not named a mail server of their own. An operator who
 * sets `SV_SMTP_HOST` has chosen where mail goes, and Mailpit is not started (spec/suite.md §1.1).
 */
export const usesMailpit = (suite: Suite): boolean =>
  environmentOf(suite) !== 'production' && suite.core.env?.SV_SMTP_HOST === undefined;
