---
title: 'Template: instance Privacy Policy'
description: Default Privacy Policy template every self-hosted instance ships at /privacy. Operators fill in the bracketed placeholders before going live.
aside: false
---

# Template — instance Privacy Policy

This is the **default content served at `/privacy`** on every Sovereign
instance, shipped as an editable page in the platform source
(`runtime/app/privacy/page.tsx`). It is a starting point, not finished legal
advice: **[Operator Name] should have this reviewed for their jurisdiction,
user base, and installed apps before relying on it.** Every bracketed
placeholder must be filled in or removed before the instance is used by real
people. Sections describe what the _platform itself_ does by default;
operators must add their own sections for anything an installed app does
beyond the platform default (see "Installed apps" below).

---

## Privacy Policy

**Instance:** [INSTANCE NAME / URL] · **Operator:** [OPERATOR NAME] ·
**Contact:** [OPERATOR CONTACT EMAIL] · **Effective date:** [DATE]

This instance runs [Sovereign](https://github.com/sovereignfs/sovereign), a
self-hosted workspace platform. [Operator Name] operates this specific
instance and is the data controller for the information described below.
This is not a policy from the Sovereign open-source project — see the
[Sovereign project's own privacy policy](https://sovereignfs.github.io/legal/privacy)
for what the project itself (not this instance) does.

### Who we are

[Operator Name], reachable at [OPERATOR CONTACT EMAIL / ADDRESS], operates
this Sovereign instance at [INSTANCE URL]. [Add jurisdiction / registered
entity information if applicable — required in many jurisdictions, e.g.
GDPR Art. 13.]

### Account information we collect

When you register for an account, we collect:

- **Email address** and **password** (stored as a salted hash, never in
  plain text) — required to create and secure your account.
- **Time zone**, automatically detected from your browser at signup so your
  dates and reminders display correctly. You can change it any time in your
  account settings; it is never used for anything beyond formatting.

We do not require your real name, phone number, or any other personal
detail to create an account unless [Operator Name] has configured
additional required fields — [describe here if applicable].

### Cookies and sessions

Signing in sets a session cookie so you stay logged in, plus a short-lived
(5 minute) signed cache of your session used to speed up page loads without
extra server round-trips. We also set a small cookie to remember your
light/dark theme preference. None of these cookies are used for advertising
or cross-site tracking, and no third-party tracking cookies are set by the
platform itself.

### Installing this instance as an app (PWA)

You can install this instance to your device's home screen or desktop as a
Progressive Web App. Installing doesn't grant any new permissions beyond
normal browsing — the installed app cannot access your camera, microphone,
or location unless a specific installed app on this instance requests it
and you separately approve that request; by default, the platform blocks
those permissions at the browser level.

To make the installed app usable with a flaky connection, your browser
caches some page content and static assets locally on your device (up to
about a day for pages, longer for static assets), and keeps a small queue
of actions you take while offline so it can sync them once you're back
online. This instance is not fully offline-first — don't assume an action
taken while offline is guaranteed to be saved or synced. See
[Install as an app](/guides/pwa) for details.

**Signing out clears this device's offline action queue and offline-page
cache**, but some other cached page content may persist in your browser's
cache for up to a day afterward until it naturally expires. On a shared or
public device, use your browser's "clear site data" option after signing
out. [Operator Name: add specific guidance here if this instance is
commonly used on shared or public devices.]

### Email

We send you email only when necessary to operate your account: verifying
your email address, resetting your password if you ask, and notifying you
that your account was created. [Operator Name] sends this mail through
[SMTP PROVIDER NAME] acting as our email delivery processor — see their
[privacy policy] for how they handle mail in transit. We do not send
marketing email unless you separately opt in. [Remove/adjust if this
instance sends other transactional or notification email, e.g. from
installed apps — list them here.]

### Where your data is stored

Your account and content are stored in this instance's own database,
hosted on infrastructure operated by [Operator Name] at [general
hosting location / region if disclosed]. Data is [encrypted at rest / not
encrypted at rest — Operator Name: state which applies to this instance].
We do not share instance data with the Sovereign open-source project — the
project has no access to this instance.

### Installed apps

This instance currently offers: [LIST INSTALLED APPS]. Each app may
collect and store additional data specific to its function (for example, a
task-tracking app stores your task lists; a notes app stores your notes).
That data is stored in this same instance database, under the same account,
and is not shared outside this instance except as described elsewhere in
this policy. [Operator Name should list any app-specific data handling that
goes beyond normal in-instance storage — e.g. an app that calls an external
API on your behalf.]

### Native device access (mobile/desktop apps)

If you use this instance through the Sovereign mobile or desktop app, some
apps may request access to device capabilities (such as your camera or
device storage) to provide their functionality. You'll be asked to approve
each such request the first time an app asks for it, and you can review or
revoke these approvals in your account settings at any time. [Update this
section once device-capability apps are actually installed on this
instance — remove if none are.]

### Push notifications

If you enable push notifications, your browser or device registers a push
subscription with [Operator Name]'s server, which we use solely to deliver
notifications you've asked for. Delivery is routed through your browser's
or device's push service (for example, a Google or Apple push service),
which is a separate third party outside our control, subject to their own
privacy terms.

### Your rights

You can export your account data at any time from your account settings
(Settings → Data → Export). You can permanently delete your account and
its data from the same page; deletion removes your account and associated
content across every installed app. [Operator Name: add any jurisdiction-
specific rights language here — e.g. GDPR/CCPA rights, and how to exercise
them if different from the built-in export/delete tools.]

### Retention

We keep your account data for as long as your account exists. [Operator
Name: state any additional retention/backup policy — e.g. how long deleted
accounts persist in backups.]

### Children's privacy

[Operator Name: state your policy — e.g. "This instance is not directed at
children under [age], and we do not knowingly collect data from them."
Adjust to your actual audience and applicable law.]

### Changes to this policy

We'll update the effective date above when this policy changes and let you
know [describe notice method, e.g. "by email" or "via an in-app notice"]
for material changes.

### Contact

Questions about this policy or your data: [OPERATOR CONTACT EMAIL].
