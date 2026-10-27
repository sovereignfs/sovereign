# Epic 3: Mail

> How core sends email: SMTP configuration, delivery and templates. Phase 2
> adds a mail API for apps on top.

## Status

⏳ In Progress

## Overview

Phase 1 needs mail for invitations, verification, password resets, "account
created" and MFA-reset notices. `packages/mailer` (imported) is adapted into a
consumer package with an SMTP transport and a transport tests can read.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.12, §3.14

## Tasks

#### ✅ 3.1 — Mail delivery and SMTP configuration

**Goal:** Core can send mail through SMTP configured by environment variables
or the Console.

**Deliverables (as built):**

- `packages/mailer`, reworked: an SMTP transport (nodemailer) and an in-memory transport for
  tests (`createMemoryTransport`: `sent`, `last`, `failNextWith`). The package reads no
  environment, has no development fallback and no silent no-op: settings come from the
  caller. Messages are validated first (recipients, sender, a one-line subject, a body; a
  line break is refused, not cleaned). Errors are `MailError`s with a code
  (`not-configured`, `invalid-message`, `connection-failed`, `authentication-failed`,
  `rejected`, `send-failed`) and a message that never carries a credential, a body or the
  library's own text
- Credentials never travel in the clear: with a login the connection must be encrypted
  (implicit TLS, or a STARTTLS upgrade that is required, not merely offered), and the
  server's certificate is verified. Connection, greeting and socket timeouts bound a request
- Core's `MailService` reads the settings on every send: a value saved in the Console wins
  over `SV_SMTP_*`, the password comes from the encrypted store, and a change applies without
  a restart (the transport is replaced when the settings change). Not configured, half
  configured, or a saved password that cannot be decrypted all make `send` fail with a message
  saying what is missing; nothing is sent on a credential nobody chose
- A warning at start-up when email cannot be sent, saying that invitations, resets and
  notices will fail and that sign-up requiring email verification (the default) cannot be
  completed. It never stops core from starting

**Not here:** the templates core ships and their branding (the next task), the flows that
call `send`, and the Console screens that edit these settings.

**Dependencies:** 1.3, 1.4

**Spec reference:** §3.12, §3.14

**Review checklist:**

- With no SMTP, start-up warns and a mail-dependent flow reports the problem: seen in the
  tests and in a running core
- A test reads a sent message from the in-memory transport
- Sent through a real SMTP server (in-process, no Docker): message, several recipients,
  non-ASCII; login over STARTTLS and over implicit TLS; refused to send credentials to a
  server without TLS or with an untrusted certificate (the password never arrived); wrong
  credentials, an unreachable server, a silent one, and a rejected recipient reported clearly
- Broken on purpose, each caught by a test: TLS not required with credentials, the
  certificate not verified, library text in the message, a line break allowed in the
  subject, a display name allowed in a recipient, an unavailable mailer that resolves
  silently, a transport kept after the settings change, an unreadable password ignored, and a
  start-up warning without its consequence

#### ⏳ 3.2 — Templates

**Goal:** Every email core sends uses a branded default template.

**Deliverables (as built):**

- English templates for invitation, email verification, password reset, account created and
  MFA reset (the last three are new; the first two are reworked), each rendered as a subject,
  HTML and plain text from one set of words by `renderEmail` in `packages/mailer`. A locale and
  operator overrides are accepted and fall back to English line by line; the old
  fixed "expires in 48 hours" invitation line is gone (an invitation states its expiry date only
  when it has one, in UTC)
- Branding from the instance name (the Console setting, else `Sovereign`) and the logo when core
  has one: the name as text in the header otherwise, or an image whose alt text is the name.
  Images arrive with the Console's instance settings; `EmailService` takes the logo address from
  a hook until then. The footer names the instance with its address
- Links are on core's public address (`SV_URL`): `emailLink` builds them, and the renderer
  refuses any link on another origin, any non-web scheme and any credentials, so a forged `Host`
  header cannot redirect a reset or verification token
- Branding is validated because it reaches HTML, CSS and a subject: the name is reduced to one
  line, the colour must be `#rrggbb`, the logo and instance address must be web addresses.
  Text settings (the instance name among them) refuse control characters when saved
- `EmailService` in core renders with the instance's branding and sends through the mail
  service, failing with a clear message when the link is wrong or email is not set up

**Not here:** editing templates (not part of Phase 1), the flows that send these emails, and the
logo images themselves.

**Dependencies:** 3.1

**Spec reference:** §3.14

**Review checklist:**

- Each template renders with and without a logo: the five, in the tests, both ways
- Links in each template point at core's public URL (`SV_URL`): every `href` in the HTML of every
  template is on it, and a link on another host, a look-alike host, another port, the other
  scheme, a credentials trick or a non-web scheme is refused
- Broken on purpose, each caught by a test: the link origin check, the colour check, the logo
  scheme check, the one-line instance name, the link left out of the text, an invitation that
  always shows an expiry, `//host` allowed in an email path, the instance name ignored, and control
  characters allowed in a setting
