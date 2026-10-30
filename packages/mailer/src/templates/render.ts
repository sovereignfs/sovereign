import { render } from '@react-email/render';
import { createElement } from 'react';
import { AccountCreatedEmail } from './AccountCreatedEmail';
import { AppMessageEmail } from './AppMessageEmail';
import { DEFAULT_PRIMARY_COLOR, type EmailBranding, type EmailLocale } from './branding';
import { interpolate, resolveEmailCopy, type EmailTemplateId } from './copy';
import { InviteEmail } from './InviteEmail';
import { MfaResetEmail } from './MfaResetEmail';
import { PasswordResetEmail } from './PasswordResetEmail';
import { VerifyEmailEmail } from './VerifyEmailEmail';

/** What to send, and the one link in it. Each link must be on the instance's own address. */
export type EmailRequest =
  | {
      template: 'invite';
      link: string;
      /** When the invitation expires. Absent when it does not. */
      expiresAt?: Date | undefined;
    }
  | { template: 'verifyEmail'; link: string }
  | { template: 'passwordReset'; link: string }
  | {
      template: 'accountCreated';
      /** The sign-in page. */
      link: string;
      /** The person's name, for a greeting. Absent when it is not known. */
      name?: string | undefined;
    }
  | {
      template: 'mfaReset';
      /** The sign-in page. */
      link: string;
    }
  | {
      /**
       * A message an app wrote for a person (core-app §4.2). The words around it are the instance's; the subject, the
       * text and the link are the app's, so they are drawn as text only. Its link is on the app's own address, so it
       * is not held to the instance's; the link to the person's switches is, and must be on the instance.
       */
      template: 'appMessage';
      appName: string;
      subject: string;
      body: string;
      /** One link, `http` or `https`: where the app's button goes. */
      appLink?: string | undefined;
      /** The page where the person switches the app's emails off. */
      manageUrl: string;
    };

/** A rendered email: all three parts, ready for `Mailer.send`. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export type EmailRenderErrorCode =
  | 'invalid-branding'
  | 'invalid-link'
  /** An app message with no app name or subject. */
  | 'invalid-message'
  /** A link that is not on the instance's own address: the shape of a password-reset poisoning attack. */
  | 'link-outside-instance';

export class EmailRenderError extends Error {
  override name = 'EmailRenderError';

  constructor(
    readonly code: EmailRenderErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function httpUrl(value: string, code: EmailRenderErrorCode, what: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EmailRenderError(code, `${what} is not an absolute URL.`);
  }
  // Only web addresses: a javascript: or data: link must never reach a button.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new EmailRenderError(code, `${what} must be an http or https address.`);
  }
  if (url.username || url.password) {
    throw new EmailRenderError(code, `${what} must not contain a user name or password.`);
  }
  return url;
}

/**
 * Checks the branding, because it ends up in HTML, in a `style` attribute and in a subject:
 * the name is reduced to one line, the colour must be a hex colour (a free-form value could
 * add styles of its own), and the logo and the instance address must be web addresses.
 */
export function prepareBranding(branding: EmailBranding): EmailBranding {
  const name = branding.name.replace(/\s+/g, ' ').trim();
  if (name === '') throw new EmailRenderError('invalid-branding', 'The instance name is empty.');
  if (branding.primaryColor !== undefined && !HEX_COLOUR.test(branding.primaryColor)) {
    throw new EmailRenderError('invalid-branding', 'The brand colour must be a #rrggbb colour.');
  }
  const instanceUrl = httpUrl(branding.instanceUrl, 'invalid-branding', 'The instance address');
  const logoUrl = branding.logoUrl
    ? httpUrl(branding.logoUrl, 'invalid-branding', 'The logo address').toString()
    : undefined;
  return {
    name,
    instanceUrl: instanceUrl.toString().replace(/\/$/, ''),
    ...(logoUrl ? { logoUrl } : {}),
    ...(branding.primaryColor ? { primaryColor: branding.primaryColor } : {}),
  };
}

/**
 * The link must be on the instance's own address. A reset or verification link built from a
 * request's `Host` header would send the token to whoever chose that header (password-reset
 * poisoning); checking it here means no flow can send one by mistake.
 */
function checkedLink(link: string, instanceUrl: string): string {
  const url = httpUrl(link, 'invalid-link', 'The link');
  if (url.origin !== new URL(instanceUrl).origin) {
    throw new EmailRenderError(
      'link-outside-instance',
      "The link is not on the instance's own address.",
    );
  }
  return url.toString();
}

const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' });

function formatExpiry(date: Date): string {
  if (Number.isNaN(date.getTime()))
    throw new EmailRenderError('invalid-link', 'The expiry date is not a date.');
  return `${DATE.format(date)} (UTC)`;
}

function interpolateAll<T extends object>(copy: T, vars: Record<string, string>): T {
  return Object.fromEntries(
    Object.entries(copy).map(([key, value]) => [key, interpolate(String(value), vars)]),
  ) as T;
}

/** Lines of plain text, with blank lines between paragraphs. */
function textOf(
  branding: EmailBranding,
  parts: (string | undefined)[],
  cta: string,
  link: string,
): string {
  const [first, ...rest] = parts.filter(
    (part): part is string => part !== undefined && part !== '',
  );
  const body = [first, `${cta}: ${link}`, ...rest]
    .filter((part) => part !== undefined)
    .join('\n\n');
  return `${branding.name}\n\n${body}\n\n--\n${branding.name}: ${branding.instanceUrl}\n`;
}

/**
 * Renders an email: the subject, the HTML and the plain text, from one set of words. The text
 * version carries the same link and says the same things, for clients that show no HTML.
 *
 * Everything that reaches the HTML goes through React, which escapes it; the subject carries
 * only the instance name, reduced to one line. English is the default; a locale and operator
 * overrides are accepted, and any line they lack falls back to English.
 */
export async function renderEmail(
  request: EmailRequest,
  rawBranding: EmailBranding,
  locale?: EmailLocale,
): Promise<RenderedEmail> {
  const branding = prepareBranding(rawBranding);
  const language = locale?.locale ?? 'en';
  const copyOf = <T extends EmailTemplateId>(id: T, extra: Record<string, string> = {}) =>
    interpolateAll(resolveEmailCopy(id, language, locale?.overrides), {
      brandName: branding.name,
      ...extra,
    });
  const html = (element: Parameters<typeof render>[0]) => render(element, { pretty: false });

  if (request.template === 'appMessage') {
    const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();
    const appName = oneLine(request.appName);
    const subject = oneLine(request.subject);
    if (appName === '' || subject === '') {
      throw new EmailRenderError(
        'invalid-message',
        'The app message needs an app name and a subject.',
      );
    }
    const manageUrl = checkedLink(request.manageUrl, branding.instanceUrl);
    const appLink = request.appLink
      ? httpUrl(request.appLink, 'invalid-link', 'The link').toString()
      : undefined;
    const copy = copyOf('appMessage', { appName });
    const body = request.body.replace(/\r\n?/g, '\n');
    return {
      subject: `${appName}: ${subject}`,
      html: await html(
        createElement(AppMessageEmail, { branding, copy, subject, body, link: appLink, manageUrl }),
      ),
      text: [
        copy.fromApp,
        subject,
        body,
        ...(appLink ? [`${copy.cta}: ${appLink}`] : []),
        `--\n${copy.why}\n${copy.stop}\n${copy.manage}: ${manageUrl}\n${branding.name}: ${branding.instanceUrl}\n`,
      ].join('\n\n'),
    };
  }

  const link = checkedLink(request.link, branding.instanceUrl);

  switch (request.template) {
    case 'passwordReset': {
      const copy = copyOf('passwordReset');
      return {
        subject: copy.subject,
        html: await html(createElement(PasswordResetEmail, { resetUrl: link, branding, copy })),
        text: textOf(branding, [copy.intro, copy.expiry, copy.ignore], copy.cta, link),
      };
    }
    case 'verifyEmail': {
      const copy = copyOf('verifyEmail');
      return {
        subject: copy.subject,
        html: await html(createElement(VerifyEmailEmail, { verifyUrl: link, branding, copy })),
        text: textOf(branding, [copy.intro, copy.expiry, copy.ignore], copy.cta, link),
      };
    }
    case 'invite': {
      const copy = copyOf(
        'invite',
        request.expiresAt ? { expires: formatExpiry(request.expiresAt) } : {},
      );
      const expiry = request.expiresAt ? copy.expiry : undefined;
      return {
        subject: copy.subject,
        html: await html(createElement(InviteEmail, { registerUrl: link, branding, copy, expiry })),
        text: textOf(branding, [copy.intro, expiry, copy.ignore], copy.cta, link),
      };
    }
    case 'accountCreated': {
      const name = request.name?.replace(/\s+/g, ' ').trim();
      const copy = copyOf('accountCreated', name ? { name } : {});
      const greeting = name ? copy.greeting : undefined;
      return {
        subject: copy.subject,
        html: await html(
          createElement(AccountCreatedEmail, { signInUrl: link, branding, copy, greeting }),
        ),
        text: textOf(branding, [greeting, copy.intro, copy.ignore], copy.cta, link),
      };
    }
    case 'mfaReset': {
      const copy = copyOf('mfaReset');
      return {
        subject: copy.subject,
        html: await html(createElement(MfaResetEmail, { signInUrl: link, branding, copy })),
        text: textOf(branding, [copy.intro, copy.next, copy.ignore], copy.cta, link),
      };
    }
  }
}

export { DEFAULT_PRIMARY_COLOR };
