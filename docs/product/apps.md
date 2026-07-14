---
title: Apps
description: Explore the platform apps and first-party Sovereign apps included with the workspace runtime.
aside: false
---

# Apps in a Sovereign workspace

Sovereign ships with the platform apps needed to operate a workspace and a
growing set of first-party apps for everyday work. Operators decide which apps
are enabled for their users, so availability can differ between instances.

In the user interface these are **apps**. In the repository and developer
documentation they are delivered as **plugins**.

## First-party Sovereign apps

### Sovereign Tasks

**Status:** Available

A privacy-first task manager for personal and shared work. Tasks supports lists,
subtasks, notes, due dates, recurrence, favourites, filters, search, manual
reordering, bulk actions, and a mobile interface designed around swipeable lists
and bottom sheets.

Tasks uses the Sovereign account and instance database rather than requiring a
separate task-service account or deployment.

[Source: sovereign-tasks](https://github.com/sovereignfs/sovereign-tasks)

### Sovereign Shopper

**Status:** Available

A shared grocery-list app for households and groups. Its current scope includes
multiple lists, item suggestions, quantities, per-item icons, editing, purchase
recording, and direct list sharing with other users on the instance.

Shopper demonstrates how a focused collaborative app can reuse Sovereign
identity, user selection, notifications, and app-scoped data.

[Source: sovereign-shopper](https://github.com/sovereignfs/sovereign-shopper)

### Sovereign Plainwrite

**Status:** Available

A Git-backed content editor for Markdown and MDX static sites. Plainwrite covers
project membership, GitHub content sync, local drafts, structured frontmatter,
autosave, publishing, staged deletion, schema tools, and per-user GitHub
credentials stored through Sovereign platform services.

Plainwrite is an example of a larger domain app using the SDK for identity,
secrets, external connections, notifications, activity, portability, and data
contracts while keeping its publishing workflow plugin-owned.

[Source: sovereign-plainwrite](https://github.com/sovereignfs/sovereign-plainwrite)

### Sovereign Wallet

**Status:** In development — Phase 1 nearing completion

A private wallet for loyalty and membership cards, sensitive-document
snapshots, and personal financial records. The current Phase 1 work includes the
Wallet home and card flows for creating, listing, opening, and displaying QR or
barcode-based cards.

Wallet is not yet presented as generally available. Later sensitive-document
features depend on the platform's storage and client-side encryption contracts
and must not be described as shipped until those foundations are ready.

The Wallet source repository will be linked when it is publicly available.

## Core workspace apps

These platform apps provide the shared workspace itself:

| App          | Availability           | Purpose                                                              |
| ------------ | ---------------------- | -------------------------------------------------------------------- |
| **Launcher** | Available              | The workspace home screen and entry point to installed apps.         |
| **Account**  | Available              | Profile, sign-in security, preferences, activity, and data controls. |
| **Console**  | Available to operators | User, app, instance, and system administration.                      |

Read the [Launcher](/plugins/launcher), [Account](/plugins/account), and
[Console](/plugins/console) documentation.

## How these appear in the repository

The platform's `plugins/` workspace contains three kinds of plugin source:

```text
plugins/
├── launcher/                       built-in workspace app
├── account/                        built-in account app
├── console/                        built-in operator app
├── sovereign-tasks/                first-party app
├── sovereign-shopper/              first-party app
├── sovereign-plainwrite/           first-party app
├── sovereign-wallet/               first-party app under development
├── example-basic/                  SDK reference
├── example-api/                    public API reference
├── example-minimal/                minimal-shell reference
├── example-overlay-small/          overlay reference
├── example-overlay-medium/         overlay reference
├── example-overlay-large/          overlay reference
└── example-monetized/              entitlement reference
```

First-party apps are maintained in standalone repositories.
`sovereign.plugins.json` declares each app repository and pinned reference that
the platform installation workflow composes into the runtime. A developer may
use a `.local` suffix for an editable local checkout, but that suffix is not part
of the canonical app or plugin name. The standalone app repository remains
authoritative for its manifest, implementation, and release history.

Example plugins are developer references, not products intended for normal
workspace use. They demonstrate SDK sessions, API routes, shell modes, and
entitlement behavior.

## Build for a custom need

An app is delivered to Sovereign as a plugin. Instead of creating a separate
service stack, a developer can use the runtime's supported contracts for:

- Authentication and the current user session.
- App-scoped database access.
- Shared interface components and workspace navigation.
- Declared storage, notification, job, event, and integration capabilities as
  those contracts become available.
- Operator-managed installation and access.

[Start building an app](/get-started/developers)
