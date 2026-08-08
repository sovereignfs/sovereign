---
title: 'Template: instance PRIVACY.md'
description: Operator-customized copy of the default privacy policy — identical to the root PRIVACY.md, plus your name and contact. Replace this instance's PRIVACY.md with your filled-in copy once ready.
aside: false
---

# Template — instance PRIVACY.md

This is the platform's default [`PRIVACY.md`](/PRIVACY.md), unchanged,
with one addition: an "operated by" line for your name and contact. Fill
in the two placeholders below, then replace this instance's `PRIVACY.md`
with your copy — edit it directly in your fork and commit it, or mount it
over the shipped file in your `sovereign-infra` deployment's
`docker-compose.override.yml`. See `docs/self-hosting.md` for both paths.

That's the whole difference. Nothing else in this document changes from
the default — there's no reason to invent operator-specific claims (a
jurisdiction, a retention policy, an acceptable-use list) unless you
actually have one to state; add sections only for things that are
genuinely true of your instance.

---

# Privacy Policy

Operated by **[Operator or Instance Name]** · Contact: **[Contact Email]**

This document describes the built-in, default behavior of
[Sovereign](https://github.com/sovereignfs/sovereign), the open-source
self-hosted platform this instance runs.

## Account information we collect

When you register for an account, this platform collects:

- **Email address** and **password** (stored as a salted hash, never in
  plain text) — required to create and secure your account.
- **Time zone**, automatically detected from your browser at signup so your
  dates and reminders display correctly. You can change it any time in your
  account settings; it is never used for anything beyond formatting.

No real name, phone number, or other personal detail is required to create
an account unless this instance's operator has configured additional
required fields.

## Cookies and sessions

Signing in sets a session cookie so you stay logged in, plus a short-lived
(5 minute) signed cache of your session used to speed up page loads without
extra server round-trips. A small cookie also remembers your light/dark
theme preference. None of these cookies are used for advertising or
cross-site tracking, and no third-party tracking cookies are set by the
platform itself.

## Installing this instance as an app (PWA)

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
taken while offline is guaranteed to be saved or synced.

Signing out clears this device's offline action queue and offline-page
cache, but some other cached page content may persist in your browser's
cache for up to a day afterward until it naturally expires. On a shared or
public device, use your browser's "clear site data" option after signing
out.

## Email

Account email is sent only when necessary to operate your account:
verifying your email address, resetting your password if you ask, and
notifying you that your account was created. Outbound mail is sent through
an SMTP server this instance's operator configures — the platform does not
run or provide a shared mail service. No marketing email is sent unless you
separately opt in.

## Where your data is stored

Your account and content are stored in this instance's own database, on
infrastructure operated by [Operator or Instance Name]. Data may or may not
be encrypted at rest, depending on this instance's configuration. This data
is never shared with or accessible to the Sovereign open-source project —
the project has no visibility into any self-hosted instance.

## Installed apps

The apps available on this instance may collect and store additional data
specific to their own function (for example, a task-tracking app stores
your task lists; a notes app stores your notes). That data is stored in
this same instance database, under the same account, and is not shared
outside this instance beyond what's described in this document.

## Native device access (mobile/desktop apps)

If you use this instance through the Sovereign mobile or desktop app, some
apps may request access to device capabilities (such as your camera or
device storage) to provide their functionality. You'll be asked to approve
each such request the first time an app asks for it, and you can review or
revoke these approvals in your account settings at any time.

## Push notifications

If you enable push notifications, your browser or device registers a push
subscription with this instance's server, used solely to deliver
notifications you've asked for. Delivery is routed through your browser's
or device's push service (for example, a Google or Apple push service),
which is a separate third party outside this platform's control, subject
to its own privacy terms.

## Your rights

You can export your account data at any time from your account settings
(Settings → Data → Export). You can permanently delete your account and its
data from the same page; deletion removes your account and associated
content across every installed app.

## Retention

Account data is kept for as long as your account exists.

## Children's privacy

[Operator or Instance Name] has not published a separate age policy for
this instance. Adjust this section if one applies.

## Changes to this document

We'll update this document when this instance's data-handling practices
change materially.

## Contact

Questions about this policy or your data: **[Contact Email]**.
