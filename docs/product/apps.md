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

These are built and maintained by the Sovereign project and installed per
instance. Availability below describes the app's own maturity, not whether any
particular instance offers it — that stays the operator's decision.

### Sovereign Kanban

**Status:** Available

A minimalist alternative to Trello: projects, boards, lists, and cards, with
drag-and-drop reordering that is also fully keyboard-accessible. Cards carry
Markdown descriptions, labels, assignees, due dates, checklists, threaded
comments, and an activity log. Boards are shared by invite with owner and member
roles, archived rather than deleted, and readable in full — with editing hidden
— by members of a public project.

[Source: sovereign-plugin-kanban](https://github.com/sovereignfs/sovereign-plugin-kanban)

### Sovereign Ledger

**Status:** Available

A budget-based personal finance tracker for a single user. Set up a budget once
— currencies, income, fixed and dynamic expense categories, saving plans, and a
balance sheet of accounts, cards, assets, deposits, loans, and people — then
track spending against it. Includes month-end review, saving jars, rule-based
insights, a daily exchange-rate job, and a month-end recap. Genuinely
multi-currency.

[Source: sovereign-plugin-ledger](https://github.com/sovereignfs/sovereign-plugin-ledger)

### Sovereign Plainwrite

**Status:** Available

A Git-backed content editor for Markdown and MDX static sites. Plainwrite covers
project membership, GitHub content sync, local drafts, structured frontmatter,
and publishing flows. It demonstrates how an app can use platform identity,
secrets, external connections, notifications, activity, portability, and data
contracts while keeping its publishing workflow plugin-owned.

[Source: sovereign-plugin-plainwrite](https://github.com/sovereignfs/sovereign-plugin-plainwrite)

### Sovereign Sheets

**Status:** Available

A lightweight spreadsheet: a cell grid, a formula bar, and multiple sheet tabs
per workbook. Alongside standard formulas it adds `FINANCE(base, quote)` for
pulling a live currency rate into a cell. Workbooks can be shared with other
users on the instance as owner, editor, or viewer, and exported to CSV or to a
native JSON file that round-trips formulas, formatting, validation rules, and
named ranges.

[Source: sovereign-plugin-sheets](https://github.com/sovereignfs/sovereign-plugin-sheets)

### Sovereign Shopper

**Status:** Available

A shared grocery-list app for households and groups. Its current scope includes
multiple lists, item suggestions, quantities, per-item icons, editing, purchase
recording, and direct list sharing with other users on the instance.

Shopper demonstrates how a focused collaborative app can reuse Sovereign
identity, user selection, notifications, and app-scoped data.

[Source: sovereign-plugin-shopper](https://github.com/sovereignfs/sovereign-plugin-shopper)

### Sovereign Tally

**Status:** Available

Splits shared expenses across a group — a household, a trip, a friend circle —
and tracks who owes whom. Balances roll up across groups and simplify down to
the fewest transfers that settle everyone, so the answer to "what do I owe?" is
always current without anyone having to raise it.

[Source: sovereign-plugin-tally](https://github.com/sovereignfs/sovereign-plugin-tally)

### Sovereign Tasks

**Status:** Available

A privacy-first task manager for personal and shared work. Tasks supports lists,
subtasks, notes, due dates, recurrence, favourites, filters, search, manual
reordering, bulk actions, and a mobile interface designed around swipeable lists
and bottom sheets.

Tasks uses the Sovereign account and instance database rather than requiring a
separate task-service account or deployment.

[Source: sovereign-plugin-tasks](https://github.com/sovereignfs/sovereign-plugin-tasks)

### Sovereign Travellog

**Status:** Available

A private trip planner and personal place check-in log. Plan trips, record the
places you have actually been, and keep that history on your own instance rather
than in a third-party social network. Place search runs through a configurable
Nominatim or Photon endpoint, which an operator can point at their own
deployment to keep search queries off a public service entirely.

[Source: sovereign-plugin-travellog](https://github.com/sovereignfs/sovereign-plugin-travellog)

### Sovereign Warden

**Status:** Available

A personal AI chat assistant built into the platform. Each user connects their
own OpenAI-API-compatible provider — OpenRouter, a vendor directly, or a
self-hosted server — with their own API key, and chats against it in multiple
named, pinnable sessions. If the operator runs the optional local inference
add-on, its model appears in the same picker with no key required.

Warden ships inside the platform repository rather than a standalone one, but it
is an ordinary installable app rather than workspace chrome: on a new instance it
stays inactive until an administrator enables it from Console, and it keeps its
own isolated database.

[Specification: Warden](/plugins/warden)

### Sovereign Docs

**Status:** In development

A document workspace where documents are Markdown underneath — editable through
either a Markdown or a WYSIWYG view, and exportable as plain `.md` at any time.
Documents live in the app's own database by default, bounded by an operator-set
limit. Connecting a Git repository is an opt-in second tier that lifts that limit
and gives a browsable Markdown tree with commit history in a repo you own.

[Source: sovereign-plugin-docs](https://github.com/sovereignfs/sovereign-plugin-docs)

### Sovereign Wallet

**Status:** In development

A private wallet for loyalty and membership cards, sensitive-document snapshots,
and personal financial records. The card flows — creating, listing, opening, and
displaying QR or barcode-based cards — are the current focus.

Wallet is not yet presented as generally available, and the sensitive-document
features beyond the card flows are not shipped. The encryption foundations they
were waiting on do now exist: Wallet is one of only two apps — Account is the
other — that use the platform's client-side encryption contract, so the card
metadata and document images it does store cannot be decrypted by the server.

[Source: sovereign-plugin-wallet](https://github.com/sovereignfs/sovereign-plugin-wallet)

## Core workspace apps

These platform apps provide the shared workspace itself. Unlike the apps above
they are not installed or activated — they are the workspace.

| App          | Availability           | Purpose                                                              |
| ------------ | ---------------------- | -------------------------------------------------------------------- |
| **Launcher** | Available              | The workspace home screen and entry point to installed apps.         |
| **Account**  | Available              | Profile, sign-in security, preferences, activity, and data controls. |
| **Inbox**    | Available              | Notifications, and durable messages from apps and administrators.    |
| **Console**  | Available to operators | User, app, instance, and system administration.                      |

Read the [Launcher](/plugins/launcher), [Account](/plugins/account),
[Inbox](/plugins/inbox), and [Console](/plugins/console) documentation.

## How these appear in the repository

The platform repository commits only the apps that ship inside it. Every other
app arrives in a checkout at install time, and `.gitignore` enforces that split:
`/plugins/*/` is ignored with an explicit allowlist for the five directories
below, so an installed app stays owned by its own repository instead of being
vendored into the platform's history.

```text
plugins/
├── account/                  committed — platform app
├── console/                  committed — platform app
├── inbox/                    committed — platform app
├── launcher/                 committed — platform app
├── warden/                   committed — first-party app, built in
└── <installed app>/          cloned at install time, never committed

example-plugins/              committed — developer references, not products
├── example-basic/            example-layouts/
├── example-api/              example-mobile/
├── example-minimal/          example-mobile-poc/
├── example-monetized/        example-encrypted/
├── example-overlay-small/    example-device-only/
├── example-overlay-medium/
└── example-overlay-large/
```

Which apps an instance installs is an operator decision rather than a property
of the platform, so it is declared per checkout: `scripts/install-plugins.ts`
reads a `sovereign.plugins.json` at the repository root — a local, gitignored
file — and clones each declared repository and reference into `plugins/<id>/`.
When that file is absent the committed `sovereign.plugins.default.json` applies
instead, and it is deliberately empty: a fresh clone runs the platform apps and
nothing else. An operator copies it to `sovereign.plugins.json` to declare a
larger set.

A developer may use a `.local` suffix for an editable local checkout, but that
suffix is not part of the canonical app or plugin name. The standalone app
repository remains authoritative for its manifest, implementation, and release
history.

Example plugins are developer references rather than products meant for normal
workspace use. They live in `example-plugins/` rather than `plugins/`, and are
composed into a build only when `SOVEREIGN_EXAMPLES_ENABLED` is set.

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
