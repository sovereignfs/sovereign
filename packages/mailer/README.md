# @sovereignfs/mailer

How Sovereign core sends email: an SMTP transport, an in-memory transport for tests, and the
validation and error handling around them. It reads **no environment**: the caller passes the
settings (core resolves them from the Console and `SV_SMTP_*`, see
[`spec/env.md`](../../spec/env.md)).

> Not published to npm. It is `private`.

```ts
import { createMailer, createSmtpTransport, resolveSmtp } from '@sovereignfs/mailer';

const status = resolveSmtp({ host, port, user, password, from }); // configured, incomplete or not-configured
if (status.state === 'configured') {
  const mailer = createMailer(createSmtpTransport(status.settings), { from: status.settings.from });
  await mailer.send({
    to: 'person@example.com',
    subject: 'Welcome',
    text: 'Hello',
    html: '<p>Hello</p>',
  });
}
```

In a test, use the memory transport and read what was sent:

```ts
const transport = createMemoryTransport();
const mailer = createMailer(transport, { from: 'no-reply@example.com' });
await mailer.send({ to: 'a@example.com', subject: 'Hi', text: 'x' });
transport.last; // { from, to: ['a@example.com'], subject: 'Hi', text: 'x', html: undefined }
transport.failNextWith(new Error('boom')); // to test what a flow does when mail fails
```

## It never fails silently

`send` either delivers or throws a `MailError` with a `code` and a message an operator can act on:
`not-configured`, `invalid-message`, `connection-failed`, `authentication-failed`, `rejected` or
`send-failed`. A flow that needs mail (an invitation, a password reset) lets the error reach the
person; nothing is dropped. When email is not set up, `createUnavailableMailer` fails every send with
the reason. The message never includes a credential, a body, or the underlying library's own text
(which can echo the user name or the server's reply); only the numeric SMTP reply is kept.

## Credentials never travel in the clear

With a user and password the connection must be encrypted: implicit TLS (port 465, or `secure`) or a
STARTTLS upgrade that is **required**, not merely offered. A server that does not offer TLS makes the
send fail instead of the password going out. The server's certificate is verified (TLS 1.2 or newer).
Without credentials STARTTLS is used when offered, so a local mail catcher on a plain port still works
(for development: `SV_SMTP_HOST=127.0.0.1`, `SV_SMTP_PORT=1025`, and a from address).

## Messages are checked before they reach a server

Recipients must be bare addresses (at most 50), the sender `address` or `Name <address>`, the subject
one line, and there must be a body (at most 1 MB). A line break in the subject or an address is refused,
not cleaned: it would let a caller inject headers.

## Templates

`renderEmail(request, branding)` returns an email's `subject`, `html` and plain `text`, all from one
set of words, ready for `Mailer.send`. There are five: `invite`, `verifyEmail`, `passwordReset`,
`accountCreated` and `mfaReset`. English is the default; a locale and operator overrides are accepted,
and any line a translation lacks falls back to English.

```ts
const email = await renderEmail(
  { template: 'passwordReset', link: 'https://core.example.com/reset-password?token=…' },
  {
    name: 'Acme Identity',
    instanceUrl: 'https://core.example.com',
    logoUrl: 'https://core.example.com/logo.png',
  },
);
await mailer.send({ to, subject: email.subject, text: email.text, html: email.html });
```

- **A link must be on the instance's own address**, or the email is not made
  (`EmailRenderError`, `link-outside-instance`). A reset or verification link built from a request's
  `Host` header would send the token to whoever chose that header; checking it here means no flow can
  do that by mistake. A link that is not an http(s) address is refused too.
- **Branding is checked, because it reaches HTML, CSS and a subject.** The name is reduced to one
  line (so a subject cannot gain a header), the colour must be `#rrggbb` (a free-form value could add
  styles of its own), and the logo and instance address must be web addresses without credentials.
  Everything that reaches the HTML goes through React, which escapes it.
- **Both parts say the same thing.** The plain text carries the same link and sentences for clients
  that show no HTML. With no logo the header is the instance name as text; with one, an image whose
  alt text is the name (many clients block images by default).
- **An invitation says when it expires only when it does.** `expiresAt` is shown as a UTC date.
