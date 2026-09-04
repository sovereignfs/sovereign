# Workstream 0018 — Notification Center: messages and email channel

**Status:** ✅ Complete — leg 1 (task 4.4) shipped as the new `fs.sovereign.inbox` plugin (see leg 1's own changelog entry for the RFC-0048-route-shape deviation), merged [PR #610](https://github.com/sovereignfs/sovereign/pull/610), `v0.120.0`. Leg 2 (task 4.5) adds an explicit, opt-in email channel for Console broadcasts and admin-composed messages — see leg 2's own changelog entry.\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0048](../rfcs/0048-messages-and-notification-detail.md) (leg 1),
[0062](../rfcs/0062-email-delivery-coverage.md) (leg 2)\
**Epics touched:** 4 (Notification Center)

---

## Goal

Add a durable Message Inbox and full notification detail views on top of
today's lightweight notification signals, then extend delivery with an
explicit, preference-aware email channel for broadcasts and messages. At the
end: a plugin can send a user a durable message with optional bell/push/email
delivery, users get full notification detail pages instead of just toasts,
and Console can compose a broadcast to selected or all users with email as
one explicit, opt-in-respecting channel among several — never an automatic
fan-out from ordinary plugin notifications.

## Definition of done

- [x] `4.4` — notifications gain `summary`/`body`/`body_format`/`action_url`
      and expiry/dedupe/priority semantics; `/inbox/<id>` (notification
      detail) and `/inbox` (Messages tab, list) + `/inbox/messages/<id>`
      exist — as the new `fs.sovereign.inbox` plugin rather than nested
      under `/account/*` as originally drafted here, see leg 1's own
      changelog entry; `messages`/`message_recipients` tables exist with
      per-recipient read/archive/delete state; `sdk.messages.send()` and
      `messages:send` permission exist; Console can compose to selected or
      all active users (`/console/messages`); sending is hardened at the
      runtime host boundary (trusted source, permission check, recipient
      validation, batch caps, rate limits).
- [x] `4.5` — delivery-channel intent is explicit via a per-send `sendEmail`
      opt-in on Console/API broadcasts and Console's admin message compose,
      never inferred from category; `sdk.notifications.send()` and
      `sdk.messages.send()` (plugin-facing sends) remain fully unchanged —
      no email channel added to either this leg, deferred to a future SDK
      minor version (see leg 2's own changelog entry for the scope
      decision); Console/API broadcasts and admin messages support optional
      email, off by default and gated per-recipient on a new
      `communicationEmail` opt-in (`notification_prefs`, default `false`);
      mandatory account/security email (Task 1.14) is fully unaffected —
      the new preference is never read by any authentication/security/
      administrative email path; delivery attempts are recorded via the
      existing RFC 0062 `email_delivery_log` (`deliveryClass: 'communication'`),
      not by storing email bodies on notification rows.

## Decisions locked

| Decision             | Choice                                                                                   | Rejected alternative and why                                                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                | Exactly 4.4 and 4.5                                                                      | Anything broader — not applicable; the developer's requested category named exactly these two tasks                                                                                                                                                                                             |
| Leg order            | 4.4 strictly before 4.5                                                                  | Building the email channel first and retrofitting it onto messages once 4.4 ships — rejected; 4.5's own deliverables explicitly say "when RFC 0048 messages land, allow a message send to create inbox/message state plus optional ... email delivery" — the dependency runs one direction only |
| Email default        | `sdk.notifications.send()` email delivery stays off by default even after both legs ship | Making email delivery opt-out instead of opt-in for existing plugin notifications — rejected outright by the epic's own goal statement: "without turning every notification into an email." Existing plugins must not start emailing users as a side effect of this workstream shipping         |
| Delivery logging     | Delivery attempts recorded via the RFC 0062 delivery log                                 | Storing email body content on notification rows for auditability — rejected; the epic is explicit that bodies stay out of notification rows, and the delivery log is the correct place for attempt/outcome records without duplicating message content                                          |
| Workstream execution | Legs — one branch, one draft PR, one review gate per leg                                 | A single combined PR — rejected for the standard reviewability reason, and because leg 2 structurally cannot be reviewed independently of leg 1 having already landed                                                                                                                           |

## Prerequisites

Leg 1 (4.4): Tasks 4.1, 4.2, 4.3, 1.12 — all already ✅.

Leg 2 (4.5): leg 1 of this workstream (4.4) must ship first. Task 1.14
(mandatory account/security email) is already ✅ and must remain unaffected
by this leg's mute-preference handling.

## Legs

| Leg | Name                                      | Epic tasks | Epics | Gate? | Done when                                                                                                       |
| --- | ----------------------------------------- | ---------- | ----- | ----- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Messages and notification detail          | 4.4        | 4     | No    | Durable Message Inbox and full notification detail views work end to end, hardened at the runtime host boundary |
| 2   | Email channel for broadcasts and messages | 4.5        | 4     | No    | Email is an explicit, preference-aware, opt-in delivery channel; mandatory security email is unaffected         |

Strict sequence — leg 2's own dependency line requires leg 1 to have shipped.

## Leg detail

### Leg 1 — Messages and notification detail

**Epic tasks:** 4.4

**Technical notes:**

- Extending notification records with `summary`/`body`/`body_format` etc.
  is additive schema — verify existing short, action-only notifications
  still deep-link directly without forcing every notification through a
  detail page.
- `messages`/`message_recipients` need per-recipient read/archive/delete
  state — this is genuinely per-recipient, not per-message, since one
  message can go to many recipients with independent read state.
- Harden the runtime host boundary explicitly: trusted source resolution,
  manifest permission checks (`messages:send`), recipient validation, batch
  caps, and rate limits — this is the boundary that keeps a compromised or
  buggy plugin from mass-messaging users, treat it as security surface.
- Preference semantics need to be consistent across inbox rows, toasts,
  push, and message-generated notifications — a muted category should mute
  uniformly, not leave one channel still firing.

**Do not proceed if:** the runtime host boundary hardening (trusted source,
permission checks, batch caps, rate limits) isn't in place before
`sdk.messages.send()` is reachable by plugins — shipping the send API ahead
of its own hardening would be a real abuse vector, not a phased rollout.

### Leg 2 — Email channel for broadcasts and messages

**Epic tasks:** 4.5

**Technical notes:**

- Delivery-channel intent (`inbox`/`toast`/`push`/`email`) needs to be
  explicit in the delivery model — not inferred from notification category.
- `sdk.notifications.send()` must not gain email delivery for existing
  plugins without an explicit opt-in via a future SDK minor version — this
  is a compatibility promise, not just a default.
- Console/API broadcast email support stays off by default until
  user/operator communication-email preferences actually exist — don't ship
  the sending capability ahead of the preference surface that makes it safe
  to use.
- Mandatory account/security email (Task 1.14) must remain outside user
  opt-out — verify this explicitly with a test that a muted
  communication-email preference doesn't suppress a password-reset or
  security-alert email.
- Record delivery attempts through the RFC 0062 delivery log — don't store
  email bodies on notification rows, matching the epic's explicit
  instruction.

**Do not proceed if:** a muted communication-email preference is found to
suppress any account/security email — that's a security-relevant regression
(a user could miss a real security alert believing notifications are muted),
not a preference-handling edge case to note and move on from.

## Risks

- **Leg 1's `sdk.messages.send()` is a new plugin-reachable send surface** —
  the runtime host boundary hardening is load-bearing, not optional
  polish; under-building it creates a spam/abuse vector reachable by any
  installed plugin.
- **Leg 2's mandatory-vs-optional email distinction is easy to get subtly
  wrong** — a bug that lets a mute preference suppress security email is
  the single most consequential failure mode in this workstream.
- Otherwise moderate risk — both legs are extensions of already-shipped,
  well-tested notification infrastructure (Tasks 4.1–4.3).

## Kill criteria

Leg 1 stands on its own — a durable Message Inbox and full notification
detail are valuable independent of email delivery. If leg 2's preference
model turns out to need more design work (e.g. a broader communication
preferences overhaul), ship leg 1 and hold leg 2 rather than rushing the
mandatory-email-must-never-be-mutable guarantee.

## Changelog

| Version | Date           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026    | Initial draft — 2 tasks (4.4, 4.5), strictly sequential                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 0.2     | September 2026 | Leg 1 (4.4) implemented, deviating from RFC 0048's own route sketch: rather than nesting the list/detail UI under Account, it ships as a new platform-type plugin, `fs.sovereign.inbox` (`/inbox`) — resolving the RFC's Open Question 1 as "yes, a first-class platform area," per direct developer direction mid-session. Notification preferences stay at `/account/notifications`, untouched — a second, explicit developer correction to an earlier plan draft that would have moved them into Inbox. Schema (8 new `notifications` columns + `messages`/`message_recipients` tables, both dialects, real `drizzle-kit`-generated migrations), `sdk.messages.send()`, the `messages:send` permission, `deliverNotification()`'s mute-policy funnel (RFC §6), `sdk.notifications.send()`'s previously-unenforced hardening (RFC §7), Console's admin message compose (`/console/messages`, audited), and export participation (RFC §9) all land in this leg. Two real pre-existing bugs caught and fixed along the way, verified against a real Postgres instance: `COUNT(*)` and bigint timestamp columns returning as strings from node-postgres with no global type parser registered (affected `countUnreadNotifications` too, not just this leg's own new queries). RFC 0048 marked `Implemented`; leg 2 (4.5, email channel) remains a separate, not-yet-started leg.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 0.3     | September 2026 | Leg 2 (4.5) implemented: RFC 0062 §§1–5 and §7 (delivery classes, the shared `sendPlatformEmail()` wrapper, the `email_delivery_log`, and `mailer:send`/`sdk.email.sendToUser()` enforcement) were already fully built by tasks 1.14 and 3.26 before this leg started — confirmed by research before writing any code — so this leg's own scope narrowed to exactly §6, the notification/message email bridge. New per-user `communicationEmail` boolean on `notification_prefs` (default `false`, additive migration, both dialects) and a new `runtime/src/communication-email.ts` (`deliverCommunicationEmail()`) — the single funnel every Console-triggered communication-class email goes through, gating on that preference before ever reaching `sendPlatformEmail()`. Wired into both broadcast routes (`/api/account/broadcast`, `/api/admin/broadcast`) and Console's admin message compose (`sendAdminMessage()`, `/api/inbox/admin-messages`) via a new optional `sendEmail` field, each surfaced as a Console checkbox ("Also send email…"); Account gains a matching "Email me about broadcasts and admin messages" toggle at `/account/notifications`. **Scope decision, confirmed with the developer before implementation:** `sdk.notifications.send()` and `sdk.messages.send()` (both plugin-facing) do not gain an email option in this leg — deferred to a future SDK minor version, matching the RFC's own explicit deferral language for notifications and extended by analogy to messages, since no plugin in this repo declares `messages:send` yet and stacking email onto it without a dedicated design pass would be more abuse-surface than this leg's scope calls for. No `@sovereignfs/sdk` or `@sovereignfs/manifest` change as a result. A real cross-schema test-isolation bug was found and fixed while writing live-Postgres coverage for the opted-in path: `sendPlatformEmail()` (like `fanOutPushToUser()` before it) always resolves the real, unmocked `getPlatformDb()` singleton internally rather than accepting the `pdb` its caller holds, so a test using an isolated per-file Postgres schema (the established pattern from leg 1's own CI-fix round) never sees rows written through it — fixed by mocking `../platform-email` in `messages.pg.test.ts`, mirroring that file's existing `../push` mock for the identical reason. RFC 0062 marked `Implemented` — all three of its `incorporated_into_plan` tasks (1.14, 3.26, 4.5) are now ✅; this workstream is now complete. |
