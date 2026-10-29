# Sovereign Core — Roadmap

**Version:** 0.42.0 · **Last updated:** 2026-10-29

_(This header tracks the root `package.json` version as of the date above.
`/sv-update-task-docs` syncs it whenever a branch bumps the root version, and
`/sv-verify` fails when it disagrees with `package.json`.)_

Chronological build index: one row per task, one task per PR, in the order
the tasks are built. Full task detail lives in [`docs/epics/`](docs/epics/);
what the core app must do is in [`docs/specs/core-app.md`](docs/specs/core-app.md);
how a task is run is in [`docs/development-workflow.md`](docs/development-workflow.md).

The Version column holds the root version a task shipped in; it reads `—`
until the task is merged.

_Status key: ✅ Complete · ⏳ In Progress · 📋 Planned · 🚧 Parked · ❌ Rejected_

---

## MVP — Phase 1: identity and app registration

### M0 — Foundation

| Version | Task                                             | Status | Epic task                               |
| ------- | ------------------------------------------------ | ------ | --------------------------------------- |
| 0.1.0   | Workspace skeleton                               | ✅     | [0.1](docs/epics/infrastructure.md)     |
| 0.2.0   | Repository documents `[parallel]`                | ✅     | [0.4](docs/epics/infrastructure.md)     |
| 0.3.0   | Continuous integration                           | ✅     | [0.3](docs/epics/infrastructure.md)     |
| 0.4.0   | Environment convention and `packages/config`     | ✅     | [1.1](docs/epics/configuration-data.md) |
| 0.5.0   | ui, bridge and mailer build in the new workspace | ✅     | [2.1](docs/epics/design-system.md)      |
| 0.6.0   | `apps/core` skeleton                             | ✅     | [0.2](docs/epics/infrastructure.md)     |
| 0.7.0   | `packages/database`                              | ✅     | [1.2](docs/epics/configuration-data.md) |
| 0.8.0   | Encryption of stored secrets `[parallel]`        | ✅     | [1.3](docs/epics/configuration-data.md) |
| 0.9.0   | Core's base schema and settings                  | ✅     | [1.4](docs/epics/configuration-data.md) |
| 0.10.0  | Publishing and licence                           | ✅     | [2.2](docs/epics/design-system.md)      |

### M1 — People can sign in to core

| Version | Task                                      | Status | Epic task                               |
| ------- | ----------------------------------------- | ------ | --------------------------------------- |
| 0.11.0  | Mail delivery and SMTP configuration      | ✅     | [3.1](docs/epics/mail.md)               |
| 0.12.0  | Templates                                 | ✅     | [3.2](docs/epics/mail.md)               |
| 0.13.0  | better-auth and email/password            | ✅     | [4.1](docs/epics/identity-auth.md)      |
| 0.14.0  | Registration policy and the first account | ✅     | [4.2](docs/epics/identity-auth.md)      |
| 0.15.0  | Email verification and password reset     | ✅     | [4.3](docs/epics/identity-auth.md)      |
| 0.16.0  | Terms, privacy and timezone `[parallel]`  | ✅     | [4.4](docs/epics/identity-auth.md)      |
| 0.17.0  | TOTP and backup codes `[parallel]`        | ✅     | [4.5](docs/epics/identity-auth.md)      |
| 0.18.0  | Passkeys `[parallel]`                     | ✅     | [4.6](docs/epics/identity-auth.md)      |
| 0.19.0  | Sessions and account states               | ✅     | [4.7](docs/epics/identity-auth.md)      |
| 0.20.0  | Roles, capabilities and checks            | ✅     | [5.1](docs/epics/roles-capabilities.md) |
| 0.21.0  | Profile                                   | ✅     | [9.1](docs/epics/identity-pages.md)     |
| 0.22.0  | Security                                  | ✅     | [9.2](docs/epics/identity-pages.md)     |
| 0.23.0  | Preferences `[parallel]`                  | ✅     | [9.3](docs/epics/identity-pages.md)     |

### M2 — Core is a sign-in server for apps

| Version | Task                               | Status | Epic task                               |
| ------- | ---------------------------------- | ------ | --------------------------------------- |
| 0.24.0  | Editable capability matrix         | ✅     | [5.2](docs/epics/roles-capabilities.md) |
| 0.25.0  | Ownership transfer                 | ✅     | [5.3](docs/epics/roles-capabilities.md) |
| 0.26.0  | Provider, flows, scopes and claims | ✅     | [6.1](docs/epics/oidc-provider.md)      |
| 0.27.0  | Consent                            | ✅     | [6.2](docs/epics/oidc-provider.md)      |
| 0.28.0  | Logout and revocation              | ✅     | [6.3](docs/epics/oidc-provider.md)      |
| 0.29.0  | Client registry                    | ✅     | [7.1](docs/epics/apps-launcher.md)      |
| 0.30.0  | Console shell                      | ✅     | [8.1](docs/epics/console.md)            |
| 0.31.0  | Accounts                           | ✅     | [8.2](docs/epics/console.md)            |
| 0.32.0  | Invites `[parallel]`               | ✅     | [8.3](docs/epics/console.md)            |
| 0.33.0  | Instance settings `[parallel]`     | ✅     | [8.4](docs/epics/console.md)            |
| 0.34.0  | Capability matrix and ownership    | ✅     | [8.5](docs/epics/console.md)            |
| 0.35.0  | Apps                               | ✅     | [8.6](docs/epics/console.md)            |
| 0.36.0  | Launcher                           | ✅     | [7.2](docs/epics/apps-launcher.md)      |
| 0.37.0  | Connected apps                     | ✅     | [9.4](docs/epics/identity-pages.md)     |
| 0.38.0  | Delete account                     | ✅     | [9.5](docs/epics/identity-pages.md)     |

### M3 — Phase 1 complete

| Version | Task                          | Status | Epic task                           |
| ------- | ----------------------------- | ------ | ----------------------------------- |
| 0.39.0  | Contract and generated client | ✅     | [10.1](docs/epics/core-api.md)      |
| 0.41.0  | Directory API                 | ✅     | [10.2](docs/epics/core-api.md)      |
| 0.40.0  | Instance branding endpoint    | ✅     | [10.3](docs/epics/core-api.md)      |
| 0.42.0  | Docker image and compose      | ✅     | [0.5](docs/epics/infrastructure.md) |
| —       | Phase 1 acceptance            | 📋     | [0.6](docs/epics/infrastructure.md) |

### Throughout M1 and M2

| Version | Task                               | Status | Epic task                          |
| ------- | ---------------------------------- | ------ | ---------------------------------- |
| —       | Components core needs `[parallel]` | 📋     | [2.3](docs/epics/design-system.md) |
