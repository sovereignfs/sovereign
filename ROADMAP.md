# Sovereign Core — Roadmap

**Version:** 0.60.0 · **Last updated:** 2026-10-30

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
| 0.44.0  | Phase 1 acceptance            | ✅     | [0.6](docs/epics/infrastructure.md) |

### Throughout M1 and M2

| Version | Task                               | Status | Epic task                          |
| ------- | ---------------------------------- | ------ | ---------------------------------- |
| 0.43.0  | Components core needs `[parallel]` | ✅     | [2.3](docs/epics/design-system.md) |

---

## After Phase 1

Work that follows the acceptance suite, in priority order: a task is picked up only when the ones above it are
merged, and the human assigns it (`docs/multi-agent.md`). An unaccepted RFC is listed with its tasks so the order can
be argued before anything is built.

### M4 — Core installs as an app (PWA)

[RFC 0001](docs/rfcs/0001-installable-core.md) (Accepted) · epic [11](docs/epics/pwa.md)

| Version | Priority | Task                                            | Status | Epic task                 |
| ------- | -------- | ----------------------------------------------- | ------ | ------------------------- |
| 0.45.0  | 1        | Manifest, icons and mobile metadata             | ✅     | [11.1](docs/epics/pwa.md) |
| 0.46.0  | 2        | Service worker and offline page                 | ✅     | [11.2](docs/epics/pwa.md) |
| —       | 3        | Standalone polish, guide and checks             | ⏳     | [11.3](docs/epics/pwa.md) |
| 0.47.0  | 4        | Icons from the instance's own logo `[parallel]` | ✅     | [11.4](docs/epics/pwa.md) |

### M5 — Core can be deployed

[RFC 0002](docs/rfcs/0002-deployment-strategies.md) (Accepted) · epic [12](docs/epics/release.md)

| Version | Priority | Task                               | Status | Epic task                     |
| ------- | -------- | ---------------------------------- | ------ | ----------------------------- |
| 0.59.0  | 1        | Publish the image                  | ✅     | [12.1](docs/epics/release.md) |
| 0.59.0  | 2        | Guides for operators `[parallel]`  | ✅     | [12.2](docs/epics/release.md) |
| —       | 3        | First release                      | 📋     | [12.3](docs/epics/release.md) |
| —       | 4        | The deployment design `[parallel]` | ⏳     | [12.4](docs/epics/release.md) |
| 0.48.0  | 5        | Host-only cookies                  | ✅     | [12.5](docs/epics/release.md) |
| 0.52.0  | 6        | Try real third-party apps          | ✅     | [12.6](docs/epics/release.md) |
| 0.53.0  | 7        | Compatibility settings             | ✅     | [12.7](docs/epics/release.md) |
| 0.52.0  | 8        | Try two more app families          | ✅     | [12.8](docs/epics/release.md) |

### M6 — Operators run core with one tool

[RFC 0002](docs/rfcs/0002-deployment-strategies.md) (Accepted) · epic [13](docs/epics/operator-cli.md)

| Version | Priority | Task                               | Status | Epic task                           |
| ------- | -------- | ---------------------------------- | ------ | ----------------------------------- |
| 0.49.0  | 1        | The specifications                 | ✅     | [13.1](docs/epics/operator-cli.md)  |
| 0.54.0  | 2        | `sovereign-admin` in the image     | ✅     | [13.2](docs/epics/operator-cli.md)  |
| —       | 3        | `sv apply`: the base               | 📋     | [13.3](docs/epics/operator-cli.md)  |
| —       | 4        | `sv apply`: apps                   | 📋     | [13.4](docs/epics/operator-cli.md)  |
| —       | 5        | Commands on the operator's machine | 📋     | [13.5](docs/epics/operator-cli.md)  |
| —       | 6        | Deploying over SSH `[parallel]`    | 📋     | [13.6](docs/epics/operator-cli.md)  |
| —       | 7        | Publishing and upgrading           | 📋     | [13.7](docs/epics/operator-cli.md)  |
| —       | 8        | Backup, restore and rollback       | 📋     | [13.8](docs/epics/operator-cli.md)  |
| —       | 9        | Deploying from GitHub `[parallel]` | 📋     | [13.9](docs/epics/operator-cli.md)  |
| —       | 10       | The operator's guide               | 📋     | [13.10](docs/epics/operator-cli.md) |
| —       | 11       | The app template                   | 📋     | [13.11](docs/epics/operator-cli.md) |

### M7 — The design system has a contract

[Specification](docs/specs/design-system.md) · epic [2](docs/epics/design-system.md)

| Version | Priority | Task                                  | Status | Epic task                          |
| ------- | -------- | ------------------------------------- | ------ | ---------------------------------- |
| 0.50.0  | 1        | The specification                     | ✅     | [2.4](docs/epics/design-system.md) |
| 0.58.0  | 2        | Audit the public surface `[parallel]` | 📋     | [2.5](docs/epics/design-system.md) |

### M8 — Apps have an SDK

[Specification](docs/specs/sdk.md) · epic [14](docs/epics/sdk.md)

| Version | Priority | Task                                     | Status | Epic task                 |
| ------- | -------- | ---------------------------------------- | ------ | ------------------------- |
| 0.51.0  | 1        | The specification                        | ✅     | [14.1](docs/epics/sdk.md) |
| 0.55.0  | 2        | Tokens, failure and today's capabilities | 📋     | [14.2](docs/epics/sdk.md) |
| 0.56.0  | 3        | Signing in, and the Next.js adapter      | 📋     | [14.3](docs/epics/sdk.md) |
| 0.57.0  | 4        | Publishing                               | 📋     | [14.4](docs/epics/sdk.md) |
| —       | 5        | App tokens in core                       | 📋     | [14.5](docs/epics/sdk.md) |
| —       | 6        | Account-deletion fan-out                 | 📋     | [14.6](docs/epics/sdk.md) |

### M9 — Core's Phase 2 is specified

Epic [15](docs/epics/core-services.md)

| Version | Priority | Task                  | Status | Epic task                           |
| ------- | -------- | --------------------- | ------ | ----------------------------------- |
| 0.60.0  | 1        | Notifications         | ✅     | [15.1](docs/epics/core-services.md) |
| —       | 2        | Mail for apps         | 📋     | [15.2](docs/epics/core-services.md) |
| —       | 3        | Activity `[parallel]` | 📋     | [15.3](docs/epics/core-services.md) |
| —       | 4        | Backups `[parallel]`  | 📋     | [15.4](docs/epics/core-services.md) |
| —       | 5        | Notifications: build  | 📋     | [15.5](docs/epics/core-services.md) |
