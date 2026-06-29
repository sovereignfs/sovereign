# Sovereign — Roadmap

**Version:** 0.9.3 · **Last updated:** 2026-06-24

Chronological build index — one row per PR. Full task detail lives in [`docs/epics/`](epics/).

---

## Pre-v1

### Phase v0.3 — Foundation

| Version | Task                                             | Status | Epic task                                                                      |
| ------- | ------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| 0.3.1   | Monorepo scaffold                                | ✅     | [0.1](epics/infrastructure.md#01--monorepo-scaffold)                           |
| 0.3.2   | Shared TypeScript config                         | ✅     | [0.2](epics/infrastructure.md#02--shared-typescript-config)                    |
| 0.3.3   | Code quality tooling                             | ✅     | [0.3](epics/infrastructure.md#03--code-quality-tooling)                        |
| 0.3.4   | `packages/db` — Drizzle client factory           | ✅     | [0.4](epics/infrastructure.md#04--packagesdb--drizzle-client-factory)          |
| 0.3.5   | `packages/manifest` — schema and validation      | ✅     | [3.1](epics/plugins-runtime.md#31--packagesmanifest--schema-and-validation)    |
| 0.3.6   | `packages/mailer` — SMTP abstraction             | ✅     | [0.5](epics/infrastructure.md#05--packagesmailer--smtp-abstraction)            |
| 0.3.7   | `packages/ui` — Sovereign Design System scaffold | ✅     | [9.1](epics/design-system.md#91--packagesui--sovereign-design-system-scaffold) |
| 0.3.8   | `packages/sdk` — interface definitions           | ✅     | [3.2](epics/plugins-runtime.md#32--packagessdk--interface-definitions)         |
| 0.3.9   | `apps/auth` — better-auth server                 | ✅     | [1.1](epics/users-auth.md#11--appsauth--better-auth-server)                    |
| 0.3.10  | Runtime scaffold                                 | ✅     | [2.1](epics/platform-shell.md#21--runtime-scaffold)                            |
| 0.3.11  | Generate script                                  | ✅     | [2.2](epics/platform-shell.md#22--generate-script)                             |
| 0.3.12  | Docker Compose for local dev                     | ✅     | [0.6](epics/infrastructure.md#06--docker-compose-for-local-dev)                |

---

### Phase v0.4 — Platform Plugins

| Version | Task                                                            | Status | Epic task                                                                                         |
| ------- | --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| 0.4.1   | Console plugin scaffold                                         | ✅     | [13.1](epics/plugin-console.md#131--console-plugin-scaffold)                                      |
| 0.4.2   | Console: user management                                        | ✅     | [13.2](epics/plugin-console.md#132--console-user-management)                                      |
| 0.4.3   | Console: plugin management                                      | ✅     | [13.3](epics/plugin-console.md#133--console-plugin-management)                                    |
| 0.4.4   | Console: tenant settings, system health, and root plugin config | ✅     | [13.4](epics/plugin-console.md#134--console-tenant-settings-system-health-and-root-plugin-config) |
| 0.4.5   | Launcher plugin                                                 | ✅     | [15.1](epics/plugin-launcher.md#151--launcher-plugin)                                             |
| 0.4.6   | Account plugin                                                  | ✅     | [14.1](epics/plugin-accounts.md#141--account-plugin)                                              |

---

### Phase v0.5 — Polish and Self-Hosting

| Version | Task                                                       | Status | Epic task                                                                                |
| ------- | ---------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| 0.5.0   | `scripts/install-plugins.ts` — plugin install script       | ✅     | [3.3](epics/plugins-runtime.md#33--scriptsinstall-pluginsts--plugin-install-script)      |
| 0.5.1   | PWA configuration                                          | ✅     | [2.10](epics/platform-shell.md#210--mobile-responsiveness--pwa-hardening)                |
| 0.5.2   | Production Docker image                                    | ✅     | [0.7](epics/infrastructure.md#07--production-docker-image)                               |
| 0.5.3   | Postgres validation                                        | ✅     | [0.8](epics/infrastructure.md#08--postgres-validation)                                   |
| 0.5.4   | `sv` CLI — core commands                                   | ✅     | [3.4](epics/plugins-runtime.md#34--sv-cli--core-commands)                                |
| 0.5.5   | SDK implementations (db and platform)                      | ✅     | [2.3](epics/platform-shell.md#23--sdk-implementations-db-and-platform)                   |
| 0.5.6   | Local session verification in middleware (AUTH-05)         | ✅     | [1.2](epics/users-auth.md#12--local-session-verification-in-middleware-auth-05)          |
| 0.5.7   | Documentation                                              | ✅     | —                                                                                        |
| 0.5.8   | CI pipeline                                                | ✅     | [0.9](epics/infrastructure.md#09--ci-pipeline)                                           |
| 0.5.9   | Public `/api` namespace delegation                         | ✅     | [2.4](epics/platform-shell.md#24--public-api-namespace-delegation)                       |
| 0.5.10  | Overlay shell mode                                         | ✅     | [2.5](epics/platform-shell.md#25--overlay-shell-mode)                                    |
| 0.5.11  | Cross-plugin data sharing (consent-gated)                  | ✅     | [2.6](epics/platform-shell.md#26--cross-plugin-data-sharing-consent-gated)               |
| 0.5.12  | Logout / self sign-out                                     | ✅     | [1.3](epics/users-auth.md#13--logout--self-sign-out)                                     |
| 0.5.13  | Activity log (RFC 0005)                                    | ✅     | [5.1](epics/activity-logs.md#51--activity-log-rfc-0005)                                  |
| 0.5.14  | Deployment & upgrade strategy (RFC 0006)                   | ✅     | [8.1](epics/data-sovereignty.md#81--deployment--upgrade-strategy-rfc-0006)               |
| 0.5.15  | User data portability (RFC 0007)                           | ✅     | [8.2](epics/data-sovereignty.md#82--user-data-portability-rfc-0007)                      |
| 0.5.16  | Security hardening, Tier 0 + Tier 1 (RFC 0008)             | ✅     | [2.7](epics/platform-shell.md#27--security-hardening-tier-0--tier-1)                     |
| 0.5.17  | Test organization (RFC 0010)                               | ✅     | [3.5](epics/plugins-runtime.md#35--test-organization)                                    |
| 0.5.18  | Icon system (RFC 0011)                                     | ✅     | [3.6](epics/plugins-runtime.md#36--icon-system)                                          |
| 0.5.19  | Registry contribution process                              | ✅     | [3.7](epics/plugins-runtime.md#37--registry-contribution-process)                        |
| 0.5.20  | Stable SDK and semver commitment                           | ✅     | [3.8](epics/plugins-runtime.md#38--stable-sdk-and-semver-commitment)                     |
| 0.5.21  | SDK distribution & plugin isolation boundary (RFC 0023)    | ✅     | [3.9](epics/plugins-runtime.md#39--sdk-distribution--plugin-isolation-boundary-rfc-0023) |
| 0.5.22  | Plugin compatibility & versioning (RFC 0024)               | ✅     | [3.10](epics/plugins-runtime.md#310--plugin-compatibility--versioning-rfc-0024)          |
| 0.5.23  | Plugin-scoped environment variables (RFC 0018)             | ✅     | [3.11](epics/plugins-runtime.md#311--plugin-scoped-environment-variables-rfc-0018)       |
| 0.5.24  | Test setup & seeding (RFC 0019)                            | ✅     | [2.8](epics/platform-shell.md#28--test-setup--seeding)                                   |
| 0.5.25  | Minimal shell mode (RFC 0014)                              | ✅     | [2.9](epics/platform-shell.md#29--minimal-shell-mode)                                    |
| 0.5.26  | Mobile responsiveness & PWA hardening (RFC 0013)           | ✅     | [2.10](epics/platform-shell.md#210--mobile-responsiveness--pwa-hardening)                |
| 0.5.27  | Passkeys & TOTP MFA (RFC 0012)                             | ✅     | [1.4](epics/users-auth.md#14--passkeys--totp-mfa-rfc-0012)                               |
| 0.5.28  | Plugin starter template & example plugins (RFC 0017)       | ✅     | [3.12](epics/plugins-runtime.md#312--plugin-starter-template--example-plugins)           |
| 0.5.29  | Accessibility audit & a11y contract (RFC 0025)             | ✅     | [10.1](epics/accessibility.md#101--accessibility-audit--a11y-contract-rfc-0025)          |
| 0.5.30  | Non-Docker production deployment, Phase 1 — PM2 (RFC 0026) | ✅     | [0.11](epics/infrastructure.md#011--non-docker-production-deployment-phase-1--pm2)       |
| 0.5.31  | Offline connectivity banner (PWA shell)                    | ✅     | [2.11](epics/platform-shell.md#211--offline-connectivity-banner)                         |

---

### Phase v0.6 — User Roles & Capabilities

| Version | Task                                     | Status | Epic task                                                            |
| ------- | ---------------------------------------- | ------ | -------------------------------------------------------------------- |
| 0.6.0   | Platform roles & capabilities (RFC 0021) | ✅     | [1.5](epics/users-auth.md#15--platform-roles--capabilities-rfc-0021) |
| 0.6.1   | Plugin-declared capabilities (RFC 0022)  | ✅     | [1.6](epics/users-auth.md#16--plugin-declared-capabilities-rfc-0022) |

---

### Phase v0.7 — Notifications

| Version | Task                              | Status | Epic task                                                      |
| ------- | --------------------------------- | ------ | -------------------------------------------------------------- |
| 0.7.0   | Notification Center (RFC 0015)    | ✅     | [4.1](epics/notification-center.md#41--notification-center)    |
| 0.7.1   | Web Push notifications (RFC 0016) | ✅     | [4.2](epics/notification-center.md#42--web-push-notifications) |

---

### Phase v0.8 — Monetization & Hardening

| Version | Task                                                            | Status | Epic task                                                                                    |
| ------- | --------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| 0.8.0   | Plugin monetization (RFC 0003)                                  | ✅     | [7.1](epics/monetization.md#71--plugin-monetization-rfc-0003)                                |
| 0.8.1   | Per-plugin database (RFC 0004)                                  | ✅     | [3.13](epics/plugins-runtime.md#313--per-plugin-database)                                    |
| 0.8.2   | E2E golden-path test suite (Playwright)                         | ✅     | [0.12](epics/infrastructure.md#012--e2e-golden-path-test-suite)                              |
| 0.8.3   | Production dev-mode & diagnostics (RFC 0020)                    | ✅     | [2.12](epics/platform-shell.md#212--production-dev-mode--diagnostics)                        |
| 0.8.4   | White-labeling, Phase 1 — Brand DB + shell injection (RFC 0027) | ✅     | [9.6](epics/design-system.md#96--white-labeling-phase-1--brand-db--shell-injection-rfc-0027) |
| 0.8.5   | Storybook for the design system and app shell                   | ✅     | [9.7](epics/design-system.md#97--storybook-for-the-design-system-and-app-shell)              |

---

### Phase v0.9+ — Pre-release Hardening

| Version | Task                                                                      | Status | Epic task                                                                                                                  |
| ------- | ------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 0.9.0   | Instance identity rename (RFC 0032)                                       | ✅     | [9.8](epics/design-system.md#98--instance-identity-rename-rfc-0032)                                                        |
| 0.9.1   | User data deletion (RFC 0033)                                             | ✅     | [1.7](epics/users-auth.md#17--user-data-deletion-rfc-0033)                                                                 |
| 0.9.2   | Notification Center: pluggable pub/sub transport (RFC 0034)               | ✅     | [4.3](epics/notification-center.md#43--notification-center-pluggable-pubsub-transport)                                     |
| 0.9.3   | Sidebar customization — plugin ordering and visibility                    | ✅     | [2.13](epics/platform-shell.md#213--sidebar-customization--plugin-ordering-and-visibility)                                 |
| 0.9.4   | Email-bound invite flow                                                   | ✅     | [1.10](epics/users-auth.md#110--email-bound-invite-flow)                                                                   |
| 0.10.0  | Test-user flag on seeded accounts                                         | ✅     | [1.11](epics/users-auth.md#111--test-user-flag-on-seeded-accounts)                                                         |
| 0.10.1  | VitePress docs site scaffold (RFC 0037)                                   | ✅     | [16.1](epics/docs.md#161--appsdocs--vitepress-workspace-scaffold)                                                          |
| 0.10.2  | Landing home page (RFC 0037)                                              | ✅     | [16.2](epics/docs.md#162--docsindexmd--landing-home-page)                                                                  |
| 0.11.0  | Internationalization, Phase 1 — Infrastructure (RFC 0029)                 | 📋     | [11.1](epics/i18n.md#111--internationalization-phase-1--infrastructure-rfc-0029)                                           |
| 0.12.0  | Internationalization, Phase 2 — Platform shell adoption (RFC 0029)        | 📋     | [11.2](epics/i18n.md#112--internationalization-phase-2--platform-shell-adoption-rfc-0029)                                  |
| 0.13.0  | Email template system + White-labeling Phase 2 (RFC 0031 + RFC 0027)      | 📋     | [9.9](epics/design-system.md#99--email-template-system--white-labeling-phase-2--email--auth-login-page-rfc-0031--rfc-0027) |
| 0.14.0  | White-labeling, Phase 3 — Dynamic PWA manifest + favicon route (RFC 0027) | 📋     | [9.10](epics/design-system.md#910--white-labeling-phase-3--dynamic-pwa-manifest--favicon-route-rfc-0027)                   |
| 0.15.0  | Design system component gaps — plugin developer readiness                 | 📋     | [9.11](epics/design-system.md#911--design-system-component-gaps--plugin-developer-readiness)                               |

---

## Post-v1

### Phase v1.0 — Extended Features

| Version | Task                                                                         | Status | Epic task                                                                                             |
| ------- | ---------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| 1.1.0   | Encryption at rest & field-level, Tier 2–4 (RFC 0008)                        | 📋     | [8.5](epics/data-sovereignty.md#85--encryption-at-rest--field-level-tier-24-rfc-0008)                 |
| 1.2.0   | Phase 2 payment integration (RFC 0003 Phase 2)                               | 📋     | [7.2](epics/monetization.md#72--phase-2-payment-integration-rfc-0003-phase-2)                         |
| 1.3.0   | Analytics, Phase 1 — Plugin scaffold + server-side infrastructure (RFC 0030) | 📋     | [6.1](epics/analytics.md#61--analytics-phase-1--plugin-scaffold--server-side-infrastructure-rfc-0030) |
| 1.4.0   | Analytics, Phase 2 — Client-side click tracking + heatmaps (RFC 0030)        | 📋     | [6.2](epics/analytics.md#62--analytics-phase-2--client-side-click-tracking--heatmaps-rfc-0030)        |

---

## Non-prioritised tasks

Tasks with accepted or draft RFCs but not yet assigned a roadmap slot. Promoted to a phase table
once prioritised.

| Version | Task                                                                  | Status | Epic task                                                                                        |
| ------- | --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| —       | Non-Docker production deployment, Phase 2 — systemd (RFC 0026)        | 📋     | [0.13](epics/infrastructure.md#013--non-docker-production-deployment-phase-2--systemd)           |
| —       | Operator fork model & upstream sync (RFC 0028)                        | 📋     | [3.14](epics/plugins-runtime.md#314--operator-fork-model--upstream-sync)                         |
| —       | Per-plugin database dialect selection (RFC 0036)                      | 📋     | [3.15](epics/plugins-runtime.md#315--per-plugin-database-dialect-selection-rfc-0036)             |
| —       | Progressive user verification, Phase 1 — Infrastructure (RFC 0035)    | 📋     | [1.8](epics/users-auth.md#18--progressive-user-verification-phase-1--infrastructure-rfc-0035)    |
| —       | Progressive user verification, Phase 2 — Capability opt-in (RFC 0035) | 📋     | [1.9](epics/users-auth.md#19--progressive-user-verification-phase-2--capability-opt-in-rfc-0035) |
| —       | Desktop app shell, macOS-first (RFC 0038)                             | 📋     | [17.1](epics/desktop.md#171--sovereign-desktop--tauri-shell-scaffold-macos-first)                |
| —       | Desktop: system tray and OS notifications (RFC 0038)                  | 📋     | [17.2](epics/desktop.md#172--system-tray-and-os-notifications)                                   |
| —       | Desktop: deep link scheme `sovereign://` (RFC 0038)                   | 📋     | [17.3](epics/desktop.md#173--deep-link-scheme-sovereign)                                         |
| —       | Desktop: keychain credential storage (RFC 0038)                       | 📋     | [17.4](epics/desktop.md#174--keychain-credential-storage)                                        |
| —       | Desktop: auto-updater (RFC 0038)                                      | 📋     | [17.5](epics/desktop.md#175--auto-updater)                                                       |
| —       | Desktop: Mac App Store distribution (RFC 0038)                        | 📋     | [17.6](epics/desktop.md#176--mac-app-store-distribution)                                         |
| —       | Design system stabilization                                           | 📋     | [9.12](epics/design-system.md#912--design-system-stabilization)                                  |
| —       | Messages and notification detail (RFC 0048)                           | 📋     | [4.4](epics/notification-center.md#44--messages-and-notification-detail-rfc-0048)                |
| —       | User directory and member selection SDK (RFC 0041)                    | 📋     | [1.12](epics/users-auth.md#112--user-directory-and-member-selection-sdk-rfc-0041)                |
| —       | Plugin-scoped roles and grants (RFC 0054)                             | 📋     | [1.13](epics/users-auth.md#113--plugin-scoped-roles-and-grants-rfc-0054)                         |
| —       | Plugin secret vault (RFC 0043)                                        | 📋     | [8.6](epics/data-sovereignty.md#86--plugin-secret-vault-rfc-0043)                                |
| —       | Plugin file storage (RFC 0044)                                        | 📋     | [8.7](epics/data-sovereignty.md#87--plugin-file-storage-rfc-0044)                                |
| —       | Plugin portability hooks (RFC 0052)                                   | 📋     | [8.8](epics/data-sovereignty.md#88--plugin-portability-hooks-rfc-0052)                           |
| —       | Plugin background jobs and schedules (RFC 0046)                       | 📋     | [3.16](epics/plugins-runtime.md#316--plugin-background-jobs-and-schedules-rfc-0046)              |
| —       | Public plugin page routes (RFC 0042)                                  | 📋     | [2.14](epics/platform-shell.md#214--public-plugin-page-routes-rfc-0042)                          |
| —       | Public plugin webhooks (RFC 0050)                                     | 📋     | [2.15](epics/platform-shell.md#215--public-plugin-webhooks-rfc-0050)                             |
| —       | Plugin events and realtime channels (RFC 0045)                        | 📋     | [3.17](epics/plugins-runtime.md#317--plugin-events-and-realtime-channels-rfc-0045)               |
| —       | Plugin tool contracts (RFC 0047)                                      | 📋     | [3.18](epics/plugins-runtime.md#318--plugin-tool-contracts-rfc-0047)                             |
| —       | Plugin external connections (RFC 0049)                                | 📋     | [3.19](epics/plugins-runtime.md#319--plugin-external-connections-rfc-0049)                       |
| —       | Cross-plugin references and dependency discovery (RFC 0051)           | 📋     | [3.20](epics/plugins-runtime.md#320--cross-plugin-references-and-dependency-discovery-rfc-0051)  |
| —       | Plugin flow handoffs (RFC 0053)                                       | 📋     | [3.21](epics/plugins-runtime.md#321--plugin-flow-handoffs-rfc-0053)                              |
| —       | Sovereign Harness platform plugin (RFC 0040)                          | 📋     | [18.1](epics/sovereign-harness.md#181--sovereign-harness-platform-plugin-rfc-0040)               |
