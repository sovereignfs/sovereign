---
rfc: 0062
title: Email delivery coverage
status: Draft
date: July 2026
author: kasunben
scope: apps/auth, runtime, packages/sdk, packages/db, packages/manifest, plugins/account, plugins/console, docs; builds on RFC 0015, RFC 0016, RFC 0031, RFC 0035, RFC 0048
incorporated_into_plan: 'Yes - epic tasks 1.14, 3.26, and 4.5'
---

# RFC 0062 - Email Delivery Coverage

## Summary

Sovereign has a working SMTP abstraction and a small number of transactional
email sends, but email delivery is not yet treated as a platform capability with
clear coverage, policy, permission checks, or audit semantics. This RFC defines
which platform events should send email, how those sends are routed, and how
operators and users control delivery.

This RFC intentionally does **not** define the email template system. Rendering,
branding, localization, preview tooling, and copy overrides remain owned by
RFC 0031. This RFC only answers: when should Sovereign send email, who is allowed
to trigger it, how failures are handled, and how email fits alongside inbox,
toast, and Web Push delivery.

## Motivation

Email is part of Sovereign's platform promise: a self-hosted runtime should give
plugins and first-party workflows a reliable way to reach users without adopting
a third-party SaaS dependency. The transport exists today, but the product
coverage is inconsistent.

The current state creates several problems:

1. **Registration is silent.** Users can create or accept accounts without any
   confirmation or welcome email. Email verification is planned separately in
   RFC 0035, but the broader delivery contract is not defined.
2. **Security-sensitive account events are in-app only.** Password change, MFA
   reset, passkey removal, account deactivation, and deletion currently rely on
   UI state or activity logs. The affected user may never see the event if they
   are not already signed in.
3. **Notifications and broadcasts have no email channel.** RFC 0015 and RFC 0016
   implemented inbox/toast/Web Push delivery. Email is not part of that delivery
   model, so long-lived or high-priority communication cannot reach users who
   have push disabled or are away from the PWA.
4. **Plugin email permission is not a real guard.** `mailer:send` exists in the
   manifest schema, but the runtime host currently exposes `sdk.mailer.send()`
   without a caller permission check. Before plugin-authored email becomes a
   documented platform capability, the host boundary needs enforcement and
   policy.
5. **Operational expectations are unclear.** Operators need to know which emails
   are mandatory, optional, or disabled when SMTP is not configured.

## Current state

- `packages/mailer` provides `createMailer()` and reads `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`. In development it
  defaults to Mailpit on `localhost:1025`; in production with no `SMTP_HOST`,
  sends no-op with a warning.
- `apps/auth/src/auth.ts` wires better-auth's `sendResetPassword` callback and
  sends a raw password-reset email through `apps/auth/src/mailer.ts`.
- `plugins/console/app/users/actions.ts` sends invite emails with
  `sdk.mailer.send()` after creating an auth-server invite token.
- `runtime/src/sdk-host.ts` registers the host `mailer.send()` implementation
  and forwards directly to `@sovereignfs/mailer`.
- `packages/manifest/src/schema.ts` includes the `mailer:send` permission, and
  `plugins/console/manifest.json` declares it.
- `runtime/src/sdk-host.ts` implements notification delivery as inbox row +
  optional SSE/Redis broker publish + optional Web Push fan-out. It does not
  send email.
- `runtime/app/api/account/broadcast/route.ts` and
  `runtime/app/api/admin/broadcast/route.ts` create notification rows for
  broadcasts; only the session-gated account route also fans out Web Push.
- RFC 0031 defines email templates and branding. RFC 0035 defines email
  verification as part of progressive user verification. RFC 0048 defines a
  future message inbox and richer notification detail model.

## Proposed design

### 1. Delivery classes

Sovereign should classify outbound email into four delivery classes:

| Class          | Examples                                                   | User opt-out | SMTP missing behavior                    |
| -------------- | ---------------------------------------------------------- | ------------ | ---------------------------------------- |
| Authentication | Password reset, email verification                         | No           | Surface error for flows that require it  |
| Security       | Password changed, MFA reset, new passkey, account deletion | No           | Log warning; do not block completed flow |
| Administrative | Invite, deactivation/reactivation, role change             | Limited      | Return actionable admin-facing warning   |
| Communication  | Broadcast, message notification, selected plugin messages  | Yes          | Fall back to inbox/push where available  |

Authentication emails are required for the user to complete the flow. Security
emails are tamper-evident alerts: they should be sent even when the actor is the
same user. Administrative emails are operator-triggered user management events.
Communication emails are optional delivery channels for announcements and future
messages.

### 2. Required first-party coverage

The implementation should add or confirm email delivery for these events:

| Event                           | Trigger owner     | Email class    | Notes                                                           |
| ------------------------------- | ----------------- | -------------- | --------------------------------------------------------------- |
| Password reset requested        | `apps/auth`       | Authentication | Already implemented; should move to shared delivery wrapper.    |
| Email verification requested    | `apps/auth`       | Authentication | Defined by RFC 0035; this RFC adopts it as required coverage.   |
| Invite created                  | `plugins/console` | Administrative | Already implemented; should use shared policy/audit path.       |
| Account created                 | `apps/auth`       | Security       | Welcome/account-created notice, not an email-verification link. |
| Password changed                | `plugins/account` | Security       | Notify the account owner after successful change.               |
| MFA enabled/disabled/reset      | Account/Console   | Security       | Notify owner; include actor type but not secrets/codes.         |
| Passkey added/removed           | Account           | Security       | Notify owner with device/user-agent hint where available.       |
| Account deactivated/reactivated | Console           | Administrative | Notify affected user when email is available.                   |
| Role changed                    | Console           | Administrative | Notify affected user for role elevation or demotion.            |
| Account deletion requested      | Account/Console   | Security       | Best-effort final notice before or immediately after deletion.  |
| Admin broadcast                 | Console/API       | Communication  | Optional email channel, default off until preferences exist.    |
| Message created                 | Runtime/messages  | Communication  | Deferred to RFC 0048 implementation.                            |

This table is intentionally about delivery coverage only. Subject lines, body
copy, rendering components, branding, and locale behavior are delegated to
RFC 0031.

### 3. Shared platform delivery wrapper

First-party code should stop calling `createMailer()` or `sdk.mailer.send()`
directly for platform-owned emails. Introduce a server-side delivery wrapper
with a small, policy-oriented API:

```ts
type EmailDeliveryClass = 'authentication' | 'security' | 'administrative' | 'communication';

interface PlatformEmailInput {
  templateId: string;
  deliveryClass: EmailDeliveryClass;
  toUserId?: string;
  toEmail: string;
  actorUserId?: string;
  source: 'auth' | 'runtime' | 'console' | 'account' | 'plugin';
  metadata?: Record<string, string | number | boolean | null>;
}

async function sendPlatformEmail(input: PlatformEmailInput): Promise<EmailDeliveryResult>;
```

The wrapper is responsible for:

- resolving whether the delivery class is enabled;
- checking user email preferences when applicable;
- calling the renderer from RFC 0031 when templates are available;
- falling back to current plain HTML/text construction until RFC 0031 ships;
- invoking `@sovereignfs/mailer`;
- recording delivery attempts for audit and diagnostics;
- returning structured results instead of forcing each caller to interpret SMTP
  behavior differently.

`apps/auth` owns its own database and should not import runtime internals. It can
use a duplicated auth-local wrapper or a narrow internal runtime endpoint, but
the implementation must preserve the auth/runtime boundary already established
by the architecture rules.

### 4. Delivery audit and diagnostics

Add a small platform-owned delivery log for non-secret metadata:

```text
email_delivery_log
- id
- tenant_id
- created_at
- delivery_class
- template_id
- source
- recipient_user_id
- recipient_email_hash
- actor_user_id
- status: skipped | queued | sent | failed
- provider_message_id
- error_code
- metadata
```

The log must not store full email bodies, reset tokens, invite tokens, or raw
recipient email addresses unless a later operator audit RFC explicitly requires
that. Hashing the recipient email is enough for diagnostics while limiting data
exposure.

Console health should expose coarse email status:

- SMTP configured: yes/no.
- Last send status and timestamp.
- Last failure code, without message bodies or tokens.
- Count of failed sends in the last 24 hours.

### 5. User preferences

User preferences should apply only where opt-out is safe:

- Authentication: always enabled.
- Security: always enabled.
- Administrative: enabled by default; future policy may allow limited opt-out
  for non-critical items, but deactivation and role change remain enabled.
- Communication: opt-in or operator-configured default, then user-controllable.

This should extend the existing notification preference model rather than create
a separate, unrelated preference UI. When RFC 0048 lands, message preferences
and email communication preferences should share a single account surface.

### 6. Notification and message email bridge

Email should not be bolted onto every notification row automatically. Instead,
notification/message sends should opt into email with explicit delivery intent:

```ts
interface DeliveryChannels {
  inbox?: boolean;
  toast?: boolean;
  push?: boolean;
  email?: boolean;
}
```

For existing `sdk.notifications.send()`, email should remain off by default to
avoid unexpectedly turning every plugin notification into an email. A future SDK
minor version may add a `channels.email` option, guarded by manifest permission
and platform policy.

For RFC 0048 messages, email is a natural optional channel because messages are
durable communication objects. A message may create an inbox message, a bell
notification, Web Push, and an email according to user preferences and sender
policy.

### 7. Plugin email permission enforcement

Before documenting direct plugin email sending as supported, the runtime host
must enforce `mailer:send` at the SDK boundary:

- `sdk.mailer.send()` must resolve the calling plugin ID from request context.
- Calls outside a plugin route context should be rejected unless explicitly
  made by trusted platform code.
- The runtime host must check the caller's manifest for `mailer:send`.
- The host should rate-limit plugin email sends per plugin and per recipient.
- The host should reject sends to arbitrary recipients unless the plugin has an
  approved reason to email external addresses. The safe default is user-scoped
  sends by user ID, with the platform resolving the recipient email.

Longer term, direct `sdk.mailer.send({ to: string })` should be treated as a
low-level escape hatch. A safer public API is:

```ts
sdk.email.sendToUser({
  recipientUserId,
  templateId,
  data,
});
```

That API would let the platform enforce recipient validity, user preferences,
rate limits, audit logging, and template ownership. This is a breaking enough
shape change that it should ship as a minor SDK addition while keeping the
existing low-level method only for trusted first-party plugins or explicitly
permissioned third-party plugins.

### 8. Failure handling

Email failure handling should match the delivery class:

- Authentication emails fail closed when the email is required to complete the
  flow. The UI should say that email delivery failed and advise the user to
  contact the operator.
- Security emails are best-effort after the state change. Failure is logged but
  does not roll back a completed password or MFA operation.
- Administrative emails should report a warning to the admin when the send
  fails, especially for invites. The invite token may still be created so the
  admin can copy the link manually.
- Communication emails are best-effort and should degrade to inbox/push where
  enabled.

No flow should expose SMTP server errors directly to ordinary users. Operator UI
can show sanitized error codes.

### 9. Configuration and Docker impact

No new required secrets are introduced. Existing SMTP env vars remain the
transport configuration:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Implementation should document that production instances without `SMTP_HOST`
cannot complete email-dependent authentication flows if email verification is
required. That is a docs and diagnostics requirement, not a new secret default.

If background retry/queueing is introduced in a later task, Docker and
non-Docker deployment docs must be updated for the worker process. This RFC does
not require a queue in its first implementation; synchronous best-effort sends
are acceptable for v1 coverage.

## UI flows

### Invite

```text
Admin creates invite
  -> Auth server stores invite token
  -> Delivery wrapper attempts administrative invite email
  -> Success: Console shows "Invite sent"
  -> Failure: Console shows "Invite created, email failed" + copy-link fallback
```

### Signup

```text
User creates account
  -> Account-created security email is attempted
  -> If RFC 0035 requires verification:
       verification email must be sent before the user can reach gated routes
  -> User lands in runtime or verify-email interstitial according to policy
```

### Security event

```text
User changes password or MFA state
  -> State change commits
  -> Security email is attempted
  -> Activity log records the user action
  -> Email delivery log records sent/skipped/failed
```

### Broadcast with email enabled

```text
Admin writes broadcast
  -> Runtime writes notification/message records
  -> Inbox/toast/push delivery follows existing preferences
  -> Email delivery runs only for recipients whose communication email is enabled
```

## Alternatives considered

### Keep ad-hoc sends in each workflow

Rejected. The current password-reset and invite implementations prove the
transport works, but duplicating policy in every caller would make opt-outs,
audit, SMTP diagnostics, and template migration inconsistent.

### Make every notification send an email

Rejected. Notifications are intentionally lightweight and can be high-volume.
Automatically emailing every notification would surprise users, create spam
risk, and make plugin notification permission much more dangerous.

### Wait for RFC 0031 before defining delivery coverage

Rejected. Template rendering and delivery policy are separate concerns. Waiting
for templates would leave unclear product requirements for registration,
security alerts, broadcasts, and plugin permission enforcement.

### Require SMTP in production

Rejected. Sovereign must remain self-hostable in constrained environments, and
some operators deliberately run without outbound email. The platform should make
email-dependent features visibly unavailable or degraded rather than require
SMTP for every deployment.

## Open questions

1. Should account-created welcome email be sent when email verification is also
   required, or should verification double as the first account email?
2. Should administrative emails other than invite/deactivation/role change be
   user-configurable, or should all Console user-management events be mandatory?
3. Should direct third-party plugin email to arbitrary external addresses ever be
   supported, or should plugin email always resolve through Sovereign users?
4. Should email delivery retries be in scope for the first implementation, or
   deferred until plugin background jobs (RFC 0046)?
5. Should the delivery log live in the platform DB only, or should `apps/auth`
   keep a separate auth-local delivery log for authentication emails?

## Adoption path

This RFC can ship in phases:

1. Document current coverage and update operator docs for SMTP-dependent flows.
2. Add the shared delivery wrapper, delivery-class policy, and delivery log.
3. Move password reset and invite sends onto the wrapper without changing user
   behavior.
4. Add first-party security and administrative event emails.
5. Enforce `mailer:send` at the SDK host boundary and add plugin rate limits.
6. Add optional email delivery for broadcasts and RFC 0048 messages.
7. When RFC 0031 ships, replace inline/plain renderers with templates without
   changing delivery policy.

Semver impact:

- `@sovereignfs/sdk`: minor if a safer `sdk.email.sendToUser()` surface is
  added; patch if only host-side enforcement changes existing behavior.
- `@sovereignfs/manifest`: patch if permission semantics are tightened without
  schema changes; minor if new email-specific manifest fields are added.
- `runtime`, `apps/auth`, `plugins/account`, and `plugins/console`: minor for
  new user-visible email behavior.
- `@sovereignfs/db`: patch for delivery-log schema additions.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
