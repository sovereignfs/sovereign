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

`renderInviteEmail` and `renderPasswordResetEmail` render the invitation and password-reset emails
(React Email). The templates core ships, and their branding, are a separate step.
