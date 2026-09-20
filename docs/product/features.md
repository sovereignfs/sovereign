---
title: Features
description: Review Sovereign capabilities with clear availability status.
aside: false
---

# Features and status

Sovereign separates shipped behavior from work that is still underway. Status
describes the project, not whether a particular operator has enabled a feature
on their instance.

## Available

| Capability                       | What it provides                                                                                                                      | Learn more                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Workspace shell and Launcher     | One responsive environment for opening installed apps.                                                                                | [Launcher](/plugins/launcher)                                         |
| Accounts and sessions            | Email/password sign-in, account settings, session handling, and recovery flows.                                                       | [Account](/plugins/account)                                           |
| Passkeys and TOTP                | Stronger account authentication when configured by the instance.                                                                      | [Security](/security)                                                 |
| Multi-user administration        | Operator controls for users, roles, apps, and instance settings.                                                                      | [Console](/plugins/console)                                           |
| Installable PWA                  | Home Screen, app launcher, or desktop installation with a standalone window.                                                          | [Install as an app](/docs/pwa)                                        |
| Native desktop app               | A desktop application that loads your own instance on macOS, Windows, or Linux.                                                       | [sovereign-desktop](https://github.com/sovereignfs/sovereign-desktop) |
| Notifications and messages       | A personal inbox for alerts and durable messages from apps and administrators.                                                        | [Inbox](/plugins/inbox)                                               |
| Personal AI assistant            | Chat against a model provider you choose and key yourself, or a local model.                                                          | [Warden](/plugins/warden)                                             |
| Client-side encryption (opt-in)  | An SDK contract letting an app encrypt chosen fields so the server can never decrypt them. Adopted so far by Account and Wallet only. | [Security](/security)                                                 |
| Push notifications               | Optional per-device background notifications when configured by the operator.                                                         | [Notification setup](/docs/pwa#enable-push-notifications)             |
| Plugin SDK boundary              | A supported contract between apps and the runtime.                                                                                    | [Build plugins](/plugin-development)                                  |
| App-scoped databases             | User-scoped plugin data with supported database helpers.                                                                              | [Plugin database](/plugin-database)                                   |
| Shared design system             | Tokens and React components for a consistent workspace UI.                                                                            | [Design system](/design-system)                                       |
| Data export and account controls | User-facing access to profile, security, preferences, and portability flows.                                                          | [Account](/plugins/account)                                           |

## In development

These capabilities have active designs or implementations, but public behavior
may still change:

- Broader plugin storage and portability contracts.
- Background jobs, events, external connections, and richer plugin tools.
- Improved operator backup and recovery workflows.
- A native mobile application, verified against real instances but not yet
  released through the app stores.

Review the [public product roadmap](/product-roadmap) for outcome-level direction
and the [RFC index](/rfcs/README) for technical proposals.

## Planned or exploring

- Encryption at rest across the data model. The field-level mechanism exists and
  is operator-configurable, but most platform and plugin data is not encrypted at
  rest today, and a whole-database approach was shipped and later withdrawn.
- Peer-to-peer chat with a separate identity and transport model.
- Assistant orchestration beyond single conversations, and local inference as a
  default rather than an operator add-on.

These are not available features. Draft RFCs describe possible designs, not a
delivery guarantee.
