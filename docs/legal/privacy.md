---
title: Privacy Policy (Sovereign project)
description: What the Sovereign open-source project, its docs site, and its official shell apps do and do not collect. Does not cover any specific self-hosted instance — see your operator's own policy for that.
aside: false
---

# Privacy Policy — the Sovereign project

**Effective date:** [DATE] · **Scope:** the Sovereign open-source project, this
documentation site, the Sovereign GitHub organization, and the official
Sovereign mobile and desktop shell apps (before they connect to any instance).

> **This policy does not cover any specific self-hosted Sovereign instance.**
> Sovereign is self-hosted software: each instance is run by its own
> operator, who is the data controller for the people using it. When you use
> a Sovereign instance, the privacy policy that applies to your account,
> your data, and how it's handled is the one published by that instance's
> operator — usually at `<instance-url>/privacy`. The Sovereign project has
> no access to any instance's data and cannot enforce or override an
> operator's policy. If you can't find an operator's policy, ask them for it
> before creating an account.

## The short version

- The Sovereign project does not run a service that you send data to.
  There is no Sovereign-operated account system, database, or backend
  collecting information about you.
- The software sends no analytics, telemetry, or usage data anywhere.
  There is no "phone home" behavior in the platform, and none is planned for
  the mobile or desktop shell apps by default.
- The mobile and desktop shell apps store only the instance URL(s) you enter,
  locally on your device, so they can reconnect you to the instance(s) you
  use. That data never leaves your device.
- This documentation site and our GitHub presence are subject to standard
  web-hosting and platform logging by our hosting/version-control providers,
  described below.

## What this policy covers

Sovereign ships in three parts, and this policy is about the project's own
handling of each:

1. **The Sovereign platform software** — the open-source code that operators
   run on their own infrastructure. The project distributes this code but
   does not operate it. We have no visibility into, and receive no data
   from, any instance.
2. **This documentation site** (the pages you're reading now) and the
   Sovereign GitHub organization (source code, issue tracker, plugin
   registry).
3. **The official Sovereign mobile app and desktop app** — universal shell
   applications (see [How It Works](/product/how-it-works)) that load
   whatever self-hosted instance URL you give them. This section covers the
   shell binary itself, before and independent of any instance it connects
   to.

## Documentation site and GitHub

- This site is static content served by our hosting provider (GitHub Pages).
  Like any web host, GitHub Pages' infrastructure processes standard
  request metadata (IP address, user agent, requested path) as part of
  serving the page; the Sovereign project does not separately collect,
  aggregate, or analyze this data. See
  [GitHub's Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)
  for what GitHub itself retains.
- We do not run any first-party analytics, tracking pixels, or advertising
  scripts on this site. There are no cookies set by this site beyond what
  your browser stores for its own operation.
- If you open an issue, submit a pull request, or otherwise interact with
  our GitHub repositories, that activity is public and governed by
  [GitHub's Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)
  and [Terms of Service](https://docs.github.com/site-policy/github-terms/github-terms-of-service).
- The [plugin registry](/plugins/) is a static, human-reviewed list of
  public plugin repositories. Installing a plugin via `pnpm install:plugins`
  clones public code from GitHub to your own machine or instance — it does
  not transmit anything about you to the Sovereign project.
- The public instance directory (where operators may voluntarily list their
  instance) only contains what an operator submits via a public,
  human-reviewed pull request — operator name, instance URL, and similar
  listing fields the operator chooses to publish. We don't independently
  collect or verify data about instances beyond what's submitted.

## Mobile and desktop shell apps

The official Sovereign mobile app (iOS/Android) and desktop app (macOS/
Windows/Linux) are thin, universal shells: on first launch, you enter the
URL of a self-hosted instance, and the app loads that instance in an
embedded web view. From that point on, your interaction is with the
instance you chose, governed by that operator's own privacy policy — not
this one.

What the shell app itself does, independent of any instance:

- **Stores your instance URL(s) locally on your device**, so the app can
  reconnect you without re-typing them. This list never leaves your device
  and is not transmitted to the Sovereign project or anyone else.
- **Introduces no telemetry, analytics, or crash reporting by default.**
  We do not collect usage data about how you use the shell app.
- **Does not register your device for push notifications on its own.** If
  a future version adds native push notifications (Apple/Google push
  services require this to be brokered through a project-operated relay,
  since app-store push credentials are issued once per app, not per
  instance), that relay is designed to forward only end-to-end-encrypted
  notification payloads it cannot itself read — see the relevant RFC in our
  documentation once shipped. This capability does not exist in the app
  today, and this policy will be updated with specifics before it does.
- App-store platforms (Apple App Store, Google Play) collect their own
  standard distribution and crash data under their own privacy terms,
  independent of anything Sovereign does.

## What we don't collect

Because the Sovereign project doesn't operate a backend service, we don't
collect, and have no way to collect: your name, email address, password,
files, messages, or any content you create in a Sovereign instance. We
don't know how many instances exist, who runs them, or who uses them,
except for instances an operator has voluntarily listed in the public
instance directory.

## Children's privacy

The Sovereign project does not knowingly collect personal information from
anyone, including children, because it does not operate a service that
collects personal information at all. Any data handling for people using a
specific instance, including any age-related policy, is set by that
instance's operator.

## Changes to this policy

We'll update the effective date above when this policy changes and, for
material changes, note it in the project's release notes.

## Contact

Questions about this policy: [PRIVACY CONTACT EMAIL]. Questions about a
specific instance's handling of your data should go to that instance's
operator, not the Sovereign project.
