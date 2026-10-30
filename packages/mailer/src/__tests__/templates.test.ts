// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  EmailRenderError,
  renderEmail,
  type EmailBranding,
  type EmailRequest,
  type RenderedEmail,
} from '../templates/index';

const INSTANCE = 'https://core.example.com';
const LOGO = 'https://core.example.com/brand/logo.png';
const branding = (extra: Partial<EmailBranding> = {}): EmailBranding => ({
  name: 'Acme Identity',
  instanceUrl: INSTANCE,
  ...extra,
});

const INVITE: EmailRequest = { template: 'invite', link: `${INSTANCE}/register?invite=tok_123` };

type LinkedRequest = Exclude<EmailRequest, { template: 'appMessage' }>;

const requests: { name: string; request: LinkedRequest; cta: string }[] = [
  {
    name: 'invite',
    request: { template: 'invite', link: `${INSTANCE}/register?invite=tok_123` },
    cta: 'Create your account',
  },
  {
    name: 'verifyEmail',
    request: { template: 'verifyEmail', link: `${INSTANCE}/verify-email?token=tok_123` },
    cta: 'Verify email address',
  },
  {
    name: 'passwordReset',
    request: { template: 'passwordReset', link: `${INSTANCE}/reset-password?token=tok_123` },
    cta: 'Reset password',
  },
  {
    name: 'accountCreated',
    request: { template: 'accountCreated', link: `${INSTANCE}/sign-in`, name: 'Ada' },
    cta: 'Sign in',
  },
  {
    name: 'mfaReset',
    request: { template: 'mfaReset', link: `${INSTANCE}/sign-in` },
    cta: 'Sign in',
  },
];

function parse(email: RenderedEmail) {
  return new DOMParser().parseFromString(email.html, 'text/html');
}

async function refusal(promise: Promise<unknown>): Promise<EmailRenderError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof EmailRenderError))
    throw new Error(`expected an EmailRenderError, got ${String(error)}`);
  return error;
}

describe.each(requests)('the $name email', ({ request, cta }) => {
  it('has a subject that names the instance and nothing unfilled', async () => {
    const { subject } = await renderEmail(request, branding());
    expect(subject).toContain('Acme Identity');
    expect(subject).not.toMatch(/\{\{|\}\}|[\r\n]/);
  });

  it('renders with no logo: the instance name is the header, in text', async () => {
    const email = await renderEmail(request, branding());
    const doc = parse(email);
    expect(doc.querySelectorAll('img')).toHaveLength(0);
    expect(doc.body.textContent).toContain('Acme Identity');
  });

  it('renders with a logo: an image whose alt text is the instance name', async () => {
    const doc = parse(await renderEmail(request, branding({ logoUrl: LOGO })));
    const images = doc.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('src')).toBe(LOGO);
    expect(images[0]?.getAttribute('alt')).toBe('Acme Identity');
  });

  it('has one call to action, pointing exactly at the link', async () => {
    const email = await renderEmail(request, branding());
    const anchors = [...parse(email).querySelectorAll('a')];
    const button = anchors.filter((a) => a.textContent === cta);
    expect(button).toHaveLength(1);
    expect(button[0]?.getAttribute('href')).toBe(new URL(request.link).toString());
  });

  it("only links to the instance's own address (SV_URL)", async () => {
    const doc = parse(await renderEmail(request, branding({ logoUrl: LOGO })));
    const hrefs = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.length).toBeGreaterThanOrEqual(2); // the call to action and the footer
    for (const href of hrefs) expect(new URL(href).origin).toBe(INSTANCE);
  });

  it('has a plain text version with the same link, the same words and no markup', async () => {
    const email = await renderEmail(request, branding());
    expect(email.text).toContain(`${cta}: ${new URL(request.link).toString()}`);
    expect(email.text).toContain('Acme Identity');
    expect(email.text).toContain(INSTANCE);
    expect(email.text).not.toMatch(/<[a-z/][^>]*>|\{\{|&amp;|&#/);
    const html = parse(email).body.textContent ?? '';
    // Every sentence in the text appears in the HTML too.
    for (const line of email.text.split('\n').filter((l) => /^[A-Z].*[.]$/.test(l))) {
      expect(html).toContain(line);
    }
  });

  it('names the instance in the footer with its address', async () => {
    const email = await renderEmail(request, branding());
    expect(parse(email).body.textContent).toContain(`Acme Identity — ${INSTANCE}`);
  });

  it('is the same every time', async () => {
    expect(await renderEmail(request, branding())).toEqual(await renderEmail(request, branding()));
  });
});

describe('what each email says', () => {
  it('the verification link is single-use and expires in an hour (core-app §3.3.3)', async () => {
    const email = await renderEmail(
      { template: 'verifyEmail', link: `${INSTANCE}/v?t=1` },
      branding(),
    );
    expect(email.text).toContain('used once and expires in 1 hour');
  });

  it('the password reset link expires in an hour (core-app §3.3.4)', async () => {
    const email = await renderEmail(
      { template: 'passwordReset', link: `${INSTANCE}/r?t=1` },
      branding(),
    );
    expect(email.text).toContain('expires in 1 hour');
    expect(email.text).toContain('safely ignore');
  });

  it('an invitation with an expiry says the date; one without says nothing about expiry', async () => {
    const link = `${INSTANCE}/register?invite=1`;
    const dated = await renderEmail(
      { template: 'invite', link, expiresAt: new Date('2026-11-12T23:30:00Z') },
      branding(),
    );
    expect(dated.text).toContain('This invitation expires on 12 November 2026 (UTC).');
    expect(parse(dated).body.textContent).toContain('expires on 12 November 2026 (UTC)');
    const open = await renderEmail({ template: 'invite', link }, branding());
    expect(open.text).not.toMatch(/expires/);
    expect(parse(open).body.textContent).not.toMatch(/expires/);
  });

  it('refuses an expiry that is not a date', async () => {
    const error = await refusal(
      renderEmail(
        { template: 'invite', link: `${INSTANCE}/r`, expiresAt: new Date('nope') },
        branding(),
      ),
    );
    expect(error.code).toBe('invalid-link');
  });

  it('account created greets the person by name when it is known, and does not when it is not', async () => {
    const link = `${INSTANCE}/sign-in`;
    expect(
      (await renderEmail({ template: 'accountCreated', link, name: 'Ada' }, branding())).text,
    ).toContain('Hi Ada,');
    const anonymous = await renderEmail({ template: 'accountCreated', link }, branding());
    expect(anonymous.text).not.toContain('Hi ');
    expect(anonymous.text).not.toContain('{{');
  });

  it('MFA reset says what changed and what to do, and who to ask if it was unexpected', async () => {
    const email = await renderEmail(
      { template: 'mfaReset', link: `${INSTANCE}/sign-in` },
      branding(),
    );
    expect(email.text).toContain(
      'An administrator reset two-step verification on your Acme Identity account.',
    );
    expect(email.text).toContain('set up two-step verification again');
    expect(email.text).toContain('contact your administrator');
    expect(email.subject).toBe('Two-step verification was reset on your Acme Identity account');
  });
});

describe('text from the outside is escaped, never trusted', () => {
  const link = `${INSTANCE}/sign-in`;

  it('escapes an instance name that is markup, in the HTML, and keeps it as plain words in the text', async () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const email = await renderEmail({ template: 'mfaReset', link }, branding({ name: hostile }));
    const doc = parse(email);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelectorAll('img')).toHaveLength(0);
    expect(doc.body.textContent).toContain(hostile);
    expect(email.html).not.toContain('<script>');
    expect(email.text).toContain(hostile);
  });

  it('escapes a person name that is markup', async () => {
    const email = await renderEmail(
      { template: 'accountCreated', link, name: '<b onmouseover=x>Ada</b>' },
      branding(),
    );
    const doc = parse(email);
    expect(doc.querySelectorAll('b')).toHaveLength(0);
    expect(doc.body.textContent).toContain('<b onmouseover=x>Ada</b>');
  });

  it('reduces an instance name or person name with line breaks to one line, so a subject cannot gain a header', async () => {
    const email = await renderEmail(
      { template: 'accountCreated', link, name: 'Ada\r\nBcc: x@example.com' },
      branding({ name: 'Acme\nBcc: y@example.com' }),
    );
    expect(email.subject).toBe('Welcome to Acme Bcc: y@example.com');
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.text).toContain('Hi Ada Bcc: x@example.com,');
  });

  it('refuses an empty instance name', async () => {
    expect((await refusal(renderEmail(INVITE, branding({ name: ' \n ' })))).code).toBe(
      'invalid-branding',
    );
  });
});

describe('branding is checked, because it reaches HTML and CSS', () => {
  const request = INVITE;

  it('uses a valid brand colour for the button, and the default when there is none', async () => {
    expect((await renderEmail(request, branding({ primaryColor: '#1a73e8' }))).html).toContain(
      'background-color:#1a73e8',
    );
    expect((await renderEmail(request, branding())).html).toContain('background-color:#09090b');
  });

  it.each([
    'red',
    '#fff',
    '#12345g',
    'red;position:fixed',
    '#1a73e8;background:url(//evil)',
    'url(x)',
  ])('refuses the colour %j, which could add styles of its own', async (color) => {
    expect((await refusal(renderEmail(request, branding({ primaryColor: color })))).code).toBe(
      'invalid-branding',
    );
  });

  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'ftp://core.example.com/logo.png',
    '/logo.png',
    'not a url',
    'https://user:pw@core.example.com/logo.png',
  ])('refuses the logo address %j', async (logoUrl) => {
    expect((await refusal(renderEmail(request, branding({ logoUrl })))).code).toBe(
      'invalid-branding',
    );
  });

  it('refuses an instance address that is not a web address', async () => {
    expect(
      (await refusal(renderEmail(request, branding({ instanceUrl: 'javascript:alert(1)' })))).code,
    ).toBe('invalid-branding');
  });

  it('accepts an instance address with a trailing slash and shows it without one', async () => {
    const email = await renderEmail(
      { template: 'mfaReset', link: `${INSTANCE}/sign-in` },
      branding({ instanceUrl: `${INSTANCE}/` }),
    );
    expect(email.text).toContain(`Acme Identity: ${INSTANCE}\n`);
  });
});

describe('links must be on the instance, or the email is not made', () => {
  it.each([
    ['another host', 'https://evil.example/reset?token=secret'],
    ['a look-alike host', 'https://core.example.com.evil.test/reset?token=secret'],
    ['a host that only starts the same', 'https://core.example.community/reset'],
    ['another port', 'https://core.example.com:8443/reset'],
    ['the other scheme', 'http://core.example.com/reset'],
    ['a credentials trick', 'https://core.example.com@evil.test/reset'],
  ])('refuses %s', async (_name, link) => {
    const error = await refusal(renderEmail({ template: 'passwordReset', link }, branding()));
    expect(error.code === 'link-outside-instance' || error.code === 'invalid-link').toBe(true);
    expect(error.message).not.toContain('secret');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    '/reset?token=1',
    'reset',
    '',
  ])('refuses %j, which is not a web address', async (link) => {
    expect((await refusal(renderEmail({ template: 'passwordReset', link }, branding()))).code).toBe(
      'invalid-link',
    );
  });

  it('keeps the token in the link exactly, query characters and all', async () => {
    const link = `${INSTANCE}/reset-password?token=a%2Bb%3D%3D&next=%2Fapps`;
    const email = await renderEmail({ template: 'passwordReset', link }, branding());
    expect(email.text).toContain(link);
    expect(parse(email).querySelector('a')?.getAttribute('href')).toBe(link);
  });

  it('accepts the instance address on another path, and an http localhost instance', async () => {
    await expect(
      renderEmail({ template: 'mfaReset', link: `${INSTANCE}/deep/path` }, branding()),
    ).resolves.toBeDefined();
    await expect(
      renderEmail(
        { template: 'mfaReset', link: 'http://localhost:3000/sign-in' },
        branding({ instanceUrl: 'http://localhost:3000' }),
      ),
    ).resolves.toBeDefined();
  });
});

describe('locales and overrides', () => {
  const link = `${INSTANCE}/reset-password?token=1`;

  it('uses a translation that exists', async () => {
    const email = await renderEmail({ template: 'passwordReset', link }, branding(), {
      locale: 'de',
    });
    expect(email.subject).toBe('Setzen Sie Ihr Acme Identity-Passwort zurück');
  });

  it('falls back to English for a template or a line a translation lacks', async () => {
    const verify = await renderEmail({ template: 'verifyEmail', link }, branding(), {
      locale: 'de',
    });
    expect(verify.subject).toBe('Verify your Acme Identity email address');
    const invite = await renderEmail(
      { template: 'invite', link, expiresAt: new Date('2026-11-12T00:00:00Z') },
      branding(),
      { locale: 'de' },
    );
    expect(invite.text).toContain('This invitation expires on 12 November 2026 (UTC).');
  });

  it('falls back to English for a locale it does not have', async () => {
    expect(
      (await renderEmail({ template: 'passwordReset', link }, branding(), { locale: 'xx' }))
        .subject,
    ).toBe('Reset your Acme Identity password');
  });

  it('applies an override over the built-in line', async () => {
    const email = await renderEmail({ template: 'passwordReset', link }, branding(), {
      locale: 'en',
      overrides: { cta: 'Choose a new password' },
    });
    expect(email.text).toContain('Choose a new password: ');
  });
});

describe('a message an app wrote', () => {
  const MANAGE = `${INSTANCE}/preferences`;
  const message = (extra: Partial<Extract<EmailRequest, { template: 'appMessage' }>> = {}) =>
    renderEmail(
      {
        template: 'appMessage',
        appName: 'Reminders',
        subject: 'Your task is due',
        body: 'Water the plants.\nThen rest.',
        manageUrl: MANAGE,
        ...extra,
      },
      branding(),
    );

  it('puts the app’s name before its subject, on one line', async () => {
    expect((await message()).subject).toBe('Reminders: Your task is due');
    expect((await message({ appName: 'Re\nminders', subject: 'A\r\nB' })).subject).toBe(
      'Re minders: A B',
    );
  });

  it('says whose message it is, why it came and how to stop it', async () => {
    const email = await message();
    expect(email.text).toContain('From Reminders, through Acme Identity');
    expect(email.text).toContain('You are getting this because you use Reminders');
    expect(email.text).toContain(`Email preferences: ${MANAGE}`);
    expect(parse(email).body.textContent).toContain('switch them off for Reminders');
  });

  it('keeps the text as written and reads none of it as markup', async () => {
    const email = await message({ body: '<b>bold</b> & <script>alert(1)</script>\nline two' });
    const doc = parse(email);
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('b')).toBeNull();
    expect(doc.body.textContent).toContain('<b>bold</b> & <script>alert(1)</script>');
    expect(email.text).toContain('<b>bold</b>');
  });

  it('draws the app’s link as the button, on the app’s own address', async () => {
    const email = await message({ appLink: 'https://reminders.example/task/1' });
    const buttons = [...parse(email).querySelectorAll('a')].filter(
      (a) => a.textContent === 'Open Reminders',
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('href')).toBe('https://reminders.example/task/1');
    expect(email.text).toContain('Open Reminders: https://reminders.example/task/1');
    expect((await message()).text).not.toContain('Open Reminders');
  });

  it('refuses a link that is not a web address, and a switches link off the instance', async () => {
    await expect(message({ appLink: 'javascript:alert(1)' })).rejects.toMatchObject({
      code: 'invalid-link',
    });
    await expect(message({ manageUrl: 'https://evil.example/preferences' })).rejects.toMatchObject({
      code: 'link-outside-instance',
    });
  });

  it('refuses a message with no app name or subject', async () => {
    await expect(message({ appName: '  ' })).rejects.toMatchObject({ code: 'invalid-message' });
    await expect(message({ subject: '' })).rejects.toMatchObject({ code: 'invalid-message' });
  });
});
