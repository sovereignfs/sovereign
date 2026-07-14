# Sovereign — Roadmap

**Version:** 0.26.0 · **Last updated:** 2026-07-14

Chronological build index — one row per PR. Full task detail lives in [`docs/epics/`](epics/).

Split by client component — **PWA** (the web app itself; installable, works in
any browser), **Desktop** (native Tauri shell, post-v1), **Mobile** (native
Capacitor shell, post-v1). See CLAUDE.md ("Native mobile app" / "Desktop app")
for the shell models — both wrap the same PWA in a native WebView and are not
open architectural questions.

---

## PWA

### Pre-v1

#### Phase v0.3 — Foundation

| Version | Task                                             | Status | Epic task                                                                       |
| ------- | ------------------------------------------------ | ------ | ------------------------------------------------------------------------------- |
| 0.3.1   | Monorepo scaffold                                | ✅     | [0.1](epics/infrastructure.md#-01--monorepo-scaffold)                           |
| 0.3.2   | Shared TypeScript config                         | ✅     | [0.2](epics/infrastructure.md#-02--shared-typescript-config)                    |
| 0.3.3   | Code quality tooling                             | ✅     | [0.3](epics/infrastructure.md#-03--code-quality-tooling)                        |
| 0.3.4   | `packages/db` — Drizzle client factory           | ✅     | [0.4](epics/infrastructure.md#-04--packagesdb--drizzle-client-factory)          |
| 0.3.5   | `packages/manifest` — schema and validation      | ✅     | [3.1](epics/plugins-runtime.md#-31--packagesmanifest--schema-and-validation)    |
| 0.3.6   | `packages/mailer` — SMTP abstraction             | ✅     | [0.5](epics/infrastructure.md#-05--packagesmailer--smtp-abstraction)            |
| 0.3.7   | `packages/ui` — Sovereign Design System scaffold | ✅     | [9.1](epics/design-system.md#-91--packagesui--sovereign-design-system-scaffold) |
| 0.3.8   | `packages/sdk` — interface definitions           | ✅     | [3.2](epics/plugins-runtime.md#-32--packagessdk--interface-definitions)         |
| 0.3.9   | `apps/auth` — better-auth server                 | ✅     | [1.1](epics/users-auth.md#-11--appsauth--better-auth-server)                    |
| 0.3.10  | Runtime scaffold                                 | ✅     | [2.1](epics/platform-shell.md#-21--runtime-scaffold)                            |
| 0.3.11  | Generate script                                  | ✅     | [2.2](epics/platform-shell.md#-22--generate-script)                             |
| 0.3.12  | Docker Compose for local dev                     | ✅     | [0.6](epics/infrastructure.md#-06--docker-compose-for-local-dev)                |

---

#### Phase v0.4 — Platform Plugins

| Version | Task                                                            | Status | Epic task                                                                                          |
| ------- | --------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| 0.4.1   | Console plugin scaffold                                         | ✅     | [13.1](epics/plugin-console.md#-131--console-plugin-scaffold)                                      |
| 0.4.2   | Console: user management                                        | ✅     | [13.2](epics/plugin-console.md#-132--console-user-management)                                      |
| 0.4.3   | Console: plugin management                                      | ✅     | [13.3](epics/plugin-console.md#-133--console-plugin-management)                                    |
| 0.4.4   | Console: tenant settings, system health, and root plugin config | ✅     | [13.4](epics/plugin-console.md#-134--console-tenant-settings-system-health-and-root-plugin-config) |
| 0.4.5   | Launcher plugin                                                 | ✅     | [15.1](epics/plugin-launcher.md#-151--launcher-plugin)                                             |
| 0.4.6   | Account plugin                                                  | ✅     | [14.1](epics/plugin-accounts.md#-141--account-plugin)                                              |

---

#### Phase v0.5 — Polish and Self-Hosting

| Version | Task                                                       | Status | Epic task                                                                            |
| ------- | ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| 0.5.0   | `scripts/install-plugins.ts` — plugin install script       | ✅     | [3.3](epics/plugins-runtime.md#-33--scriptsinstall-pluginsts--plugin-install-script) |
| 0.5.1   | PWA configuration                                          | ✅     | [2.10](epics/platform-shell.md#-210--mobile-responsiveness--pwa-hardening)           |
| 0.5.2   | Production Docker image                                    | ✅     | [0.7](epics/infrastructure.md#-07--production-docker-image)                          |
| 0.5.3   | Postgres validation                                        | ✅     | [0.8](epics/infrastructure.md#-08--postgres-validation)                              |
| 0.5.4   | `sv` CLI — core commands                                   | ✅     | [3.4](epics/plugins-runtime.md#-34--sv-cli--core-commands)                           |
| 0.5.5   | SDK implementations (db and platform)                      | ✅     | [2.3](epics/platform-shell.md#-23--sdk-implementations-db-and-platform)              |
| 0.5.6   | Local session verification in middleware (AUTH-05)         | ✅     | [1.2](epics/users-auth.md#-12--local-session-verification-in-middleware-auth-05)     |
| 0.5.7   | Documentation                                              | ✅     | —                                                                                    |
| 0.5.8   | CI pipeline                                                | ✅     | [0.9](epics/infrastructure.md#-09--ci-pipeline)                                      |
| 0.5.9   | Public `/api` namespace delegation                         | ✅     | [2.4](epics/platform-shell.md#-24--public-api-namespace-delegation)                  |
| 0.5.10  | Overlay shell mode                                         | ✅     | [2.5](epics/platform-shell.md#-25--overlay-shell-mode)                               |
| 0.5.11  | Cross-plugin data sharing (consent-gated)                  | ✅     | [2.6](epics/platform-shell.md#-26--cross-plugin-data-sharing-consent-gated)          |
| 0.5.12  | Logout / self sign-out                                     | ✅     | [1.3](epics/users-auth.md#-13--logout--self-sign-out)                                |
| 0.5.13  | Activity log (RFC 0005)                                    | ✅     | [5.1](epics/activity-logs.md#-51--activity-log-rfc-0005)                             |
| 0.5.14  | Deployment & upgrade strategy (RFC 0006)                   | ✅     | [8.1](epics/data-sovereignty.md#-81--deployment--upgrade-strategy-rfc-0006)          |
| 0.5.15  | User data portability (RFC 0007)                           | ✅     | [8.2](epics/data-sovereignty.md#-82--user-data-portability-rfc-0007)                 |
| 0.5.16  | Security hardening, Tier 0 + Tier 1 (RFC 0008)             | ✅     | [2.7](epics/platform-shell.md#-27--security-hardening-tier-0--tier-1)                |
| 0.5.17  | Test organization (RFC 0010)                               | ✅     | [3.5](epics/plugins-runtime.md#-35--test-organization)                               |
| 0.5.18  | Icon system (RFC 0011)                                     | ✅     | [3.6](epics/plugins-runtime.md#-36--icon-system)                                     |
| 0.5.19  | Registry contribution process                              | ✅     | [3.7](epics/plugins-runtime.md#-37--registry-contribution-process)                   |
| 0.5.20  | Stable SDK and semver commitment                           | ✅     | [3.8](epics/plugins-runtime.md#-38--stable-sdk-and-semver-commitment)                |
| 0.5.21  | SDK distribution & plugin isolation boundary (RFC 0023)    | ✅     | [3.9](epics/plugins-runtime.md#-39--sdk-distribution--plugin-isolation-boundary)     |
| 0.5.22  | Plugin compatibility & versioning (RFC 0024)               | ✅     | [3.10](epics/plugins-runtime.md#-310--plugin-compatibility--versioning)              |
| 0.5.23  | Plugin-scoped environment variables (RFC 0018)             | ✅     | [3.11](epics/plugins-runtime.md#-311--plugin-scoped-environment-variables)           |
| 0.5.24  | Test setup & seeding (RFC 0019)                            | ✅     | [2.8](epics/platform-shell.md#-28--test-setup--seeding)                              |
| 0.5.25  | Minimal shell mode (RFC 0014)                              | ✅     | [2.9](epics/platform-shell.md#-29--minimal-shell-mode)                               |
| 0.5.26  | Mobile responsiveness & PWA hardening (RFC 0013)           | ✅     | [2.10](epics/platform-shell.md#-210--mobile-responsiveness--pwa-hardening)           |
| 0.5.27  | Passkeys & TOTP MFA (RFC 0012)                             | ✅     | [1.4](epics/users-auth.md#-14--passkeys--totp-mfa-rfc-0012)                          |
| 0.5.28  | Plugin starter template & example plugins (RFC 0017)       | ✅     | [3.12](epics/plugins-runtime.md#-312--plugin-starter-template--example-plugins)      |
| 0.5.29  | Accessibility audit & a11y contract (RFC 0025)             | ✅     | [10.1](epics/accessibility.md#-101--accessibility-audit--a11y-contract-rfc-0025)     |
| 0.5.30  | Non-Docker production deployment, Phase 1 — PM2 (RFC 0026) | ✅     | [0.11](epics/infrastructure.md#-011--non-docker-production-deployment-phase-1--pm2)  |
| 0.5.31  | Offline connectivity banner (PWA shell)                    | ✅     | [2.11](epics/platform-shell.md#-211--offline-connectivity-banner)                    |

---

#### Phase v0.6 — User Roles & Capabilities

| Version | Task                                     | Status | Epic task                                                             |
| ------- | ---------------------------------------- | ------ | --------------------------------------------------------------------- |
| 0.6.0   | Platform roles & capabilities (RFC 0021) | ✅     | [1.5](epics/users-auth.md#-15--platform-roles--capabilities-rfc-0021) |
| 0.6.1   | Plugin-declared capabilities (RFC 0022)  | ✅     | [1.6](epics/users-auth.md#-16--plugin-declared-capabilities-rfc-0022) |

---

#### Phase v0.7 — Notifications

| Version | Task                              | Status | Epic task                                                       |
| ------- | --------------------------------- | ------ | --------------------------------------------------------------- |
| 0.7.0   | Notification Center (RFC 0015)    | ✅     | [4.1](epics/notification-center.md#-41--notification-center)    |
| 0.7.1   | Web Push notifications (RFC 0016) | ✅     | [4.2](epics/notification-center.md#-42--web-push-notifications) |

---

#### Phase v0.8 — Monetization & Hardening

| Version | Task                                                            | Status | Epic task                                                                                     |
| ------- | --------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| 0.8.0   | Plugin monetization (RFC 0003)                                  | ✅     | [7.1](epics/monetization.md#-71--plugin-monetization-rfc-0003)                                |
| 0.8.1   | Per-plugin database (RFC 0004)                                  | ✅     | [3.13](epics/plugins-runtime.md#-313--per-plugin-database)                                    |
| 0.8.2   | E2E golden-path test suite (Playwright)                         | ✅     | [0.12](epics/infrastructure.md#-012--e2e-golden-path-test-suite)                              |
| 0.8.3   | Production dev-mode & diagnostics (RFC 0020)                    | ✅     | [2.12](epics/platform-shell.md#-212--production-dev-mode--diagnostics)                        |
| 0.8.4   | White-labeling, Phase 1 — Brand DB + shell injection (RFC 0027) | ✅     | [9.6](epics/design-system.md#-96--white-labeling-phase-1--brand-db--shell-injection-rfc-0027) |
| 0.8.5   | Storybook for the design system and app shell                   | ✅     | [9.7](epics/design-system.md#-97--storybook-for-the-design-system-and-app-shell)              |

---

#### Phase v0.9+ — Pre-release Hardening

| Version | Task                                                        | Status | Epic task                                                                                     |
| ------- | ----------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| 0.9.0   | Instance identity rename (RFC 0032)                         | ✅     | [9.8](epics/design-system.md#-98--instance-identity-rename-rfc-0032)                          |
| 0.9.1   | User data deletion (RFC 0033)                               | ✅     | [1.7](epics/users-auth.md#-17--user-data-deletion-rfc-0033)                                   |
| 0.9.2   | Notification Center: pluggable pub/sub transport (RFC 0034) | ✅     | [4.3](epics/notification-center.md#-43--notification-center-pluggable-pubsub-transport)       |
| 0.9.3   | Sidebar customization — plugin ordering and visibility      | ✅     | [2.13](epics/platform-shell.md#-213--sidebar-customization--plugin-ordering-and-visibility)   |
| 0.9.4   | Email-bound invite flow                                     | ✅     | [1.10](epics/users-auth.md#-110--email-bound-invite-flow)                                     |
| 0.10.0  | Test-user flag on seeded accounts                           | ✅     | [1.11](epics/users-auth.md#-111--test-user-flag-on-seeded-accounts)                           |
| 0.10.1  | VitePress docs site scaffold (RFC 0037)                     | ✅     | [16.1](epics/docs.md#-161--appsdocs--vitepress-workspace-scaffold)                            |
| 0.10.2  | Landing home page (RFC 0037)                                | ✅     | [16.2](epics/docs.md#-162--docsindexmd--landing-home-page)                                    |
| —       | Design system component gaps — plugin developer readiness   | ✅     | [9.11](epics/design-system.md#-911--design-system-component-gaps--plugin-developer-readiness) |
| —       | Operator fork model & upstream sync (RFC 0028)              | ✅     | [3.14](epics/plugins-runtime.md#-314--operator-fork-model--upstream-sync)                     |
| —       | Current-state testing documentation cleanup                 | ✅     | [16.3](epics/docs.md#-163--current-state-testing-documentation-cleanup)                       |
| —       | Middleware regression coverage                              | ✅     | [2.16](epics/platform-shell.md#-216--middleware-regression-coverage)                          |
| —       | Generate script regression coverage                         | ✅     | [3.22](epics/plugins-runtime.md#-322--generate-script-regression-coverage)                    |
| —       | Overlay size variants for platform plugins                  | ✅     | [2.19](epics/platform-shell.md#-219--overlay-size-variants-for-platform-plugins)              |
| 0.11.2  | Design system stabilization                                 | ✅     | [9.12](epics/design-system.md#-912--design-system-stabilization)                              |
| 0.11.3  | Per-plugin database dialect selection (RFC 0036)            | ✅     | [3.15](epics/plugins-runtime.md#-315--per-plugin-database-dialect-selection-rfc-0036)         |
| 0.12.0  | Extract example plugins to their own repository             | ✅     | [12.2](epics/example-plugins.md#-122--extract-example-plugins-to-their-own-repository)        |
| 0.13.0  | Admin disable surface for example plugins                   | ✅     | [12.3](epics/example-plugins.md#-123--admin-disable-surface-for-example-plugins)              |

---

### Post-v1

#### Phase v1.0 — Extended Features

| Version | Task                                                                         | Status | Epic task                                                                                              |
| ------- | ---------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| 1.1.0   | Encryption at rest & field-level, Tier 2–4 (RFC 0008)                        | 📋     | [8.5](epics/data-sovereignty.md#-85--encryption-at-rest--field-level-tier-24-rfc-0008)                 |
| 1.2.0   | Phase 2 payment integration (RFC 0003 Phase 2)                               | 📋     | [7.2](epics/monetization.md#-72--phase-2-payment-integration-rfc-0003-phase-2)                         |
| 1.3.0   | Analytics, Phase 1 — Plugin scaffold + server-side infrastructure (RFC 0030) | 📋     | [6.1](epics/analytics.md#-61--analytics-phase-1--plugin-scaffold--server-side-infrastructure-rfc-0030) |
| 1.4.0   | Analytics, Phase 2 — Client-side click tracking + heatmaps (RFC 0030)        | 📋     | [6.2](epics/analytics.md#-62--analytics-phase-2--client-side-click-tracking--heatmaps-rfc-0030)        |

---

### Non-prioritised tasks

Tasks with accepted or draft RFCs but not yet assigned a roadmap slot. Promoted to a phase table
once prioritised.

| Version | Task                                                                      | Status | Epic task                                                                                                                   |
| ------- | ------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| —       | Internationalization, Phase 1 — Infrastructure (RFC 0029)                 | 📋     | [11.1](epics/i18n.md#-111--internationalization-phase-1--infrastructure-rfc-0029)                                           |
| —       | Internationalization, Phase 2 — Platform shell adoption (RFC 0029)        | 📋     | [11.2](epics/i18n.md#-112--internationalization-phase-2--platform-shell-adoption-rfc-0029)                                  |
| —       | Email template system + White-labeling Phase 2 (RFC 0031 + RFC 0027)      | 📋     | [9.9](epics/design-system.md#-99--email-template-system--white-labeling-phase-2--email--auth-login-page-rfc-0031--rfc-0027) |
| —       | White-labeling, Phase 3 — Dynamic PWA manifest + favicon route (RFC 0027) | 📋     | [9.10](epics/design-system.md#-910--white-labeling-phase-3--dynamic-pwa-manifest--favicon-route-rfc-0027)                   |
| —       | Non-Docker production deployment, Phase 2 — systemd (RFC 0026)            | 📋     | [0.13](epics/infrastructure.md#-013--non-docker-production-deployment-phase-2--systemd)                                     |
| —       | Progressive user verification, Phase 1 — Infrastructure (RFC 0035)        | 📋     | [1.8](epics/users-auth.md#-18--progressive-user-verification-phase-1--infrastructure-rfc-0035)                              |
| —       | Progressive user verification, Phase 2 — Capability opt-in (RFC 0035)     | 📋     | [1.9](epics/users-auth.md#-19--progressive-user-verification-phase-2--capability-opt-in-rfc-0035)                           |
| —       | Subtle Sovereign attribution (RFC 0027)                                   | 📋     | [9.13](epics/design-system.md#-913--subtle-sovereign-attribution-rfc-0027)                                                  |
| —       | Local visual regression testing (RFC 0059)                                | 📋     | [9.14](epics/design-system.md#-914--local-visual-regression-testing-rfc-0059)                                               |
| —       | NavTabs Link support + PageHeader heading level                           | 📋     | [9.15](epics/design-system.md#-915--navtabs-link-support--pageheader-heading-level)                                         |
| —       | Editor workflow primitives for content plugins                            | ✅     | [9.16](epics/design-system.md#-916--editor-workflow-primitives-for-content-plugins)                                         |
| —       | Messages and notification detail (RFC 0048)                               | 📋     | [4.4](epics/notification-center.md#-44--messages-and-notification-detail-rfc-0048)                                          |
| —       | User directory and member selection SDK (RFC 0041)                        | ✅     | [1.12](epics/users-auth.md#-112--user-directory-and-member-selection-sdk-rfc-0041)                                          |
| —       | Plugin-scoped roles and grants (RFC 0054)                                 | 📋     | [1.13](epics/users-auth.md#-113--plugin-scoped-roles-and-grants-rfc-0054)                                                   |
| —       | Account and security email delivery coverage (RFC 0062)                   | ✅     | [1.14](epics/users-auth.md#-114--account-and-security-email-delivery-coverage-rfc-0062)                                     |
| —       | User groups foundation (RFC 0065)                                         | 📋     | [1.15](epics/users-auth.md#-115--user-groups-foundation-rfc-0065)                                                           |
| —       | Plugin secret vault (RFC 0043)                                            | ✅     | [8.6](epics/data-sovereignty.md#-86--plugin-secret-vault-rfc-0043)                                                          |
| —       | Plugin file storage (RFC 0044)                                            | ✅     | [8.7](epics/data-sovereignty.md#-87--plugin-file-storage-rfc-0044)                                                          |
| —       | Plugin portability hooks (RFC 0052)                                       | ✅     | [8.8](epics/data-sovereignty.md#-88--plugin-portability-hooks-rfc-0052)                                                     |
| —       | Client-side encryption core (RFC 0060)                                    | ✅     | [8.9](epics/data-sovereignty.md#-89--client-side-encryption-core-rfc-0060)                                                  |
| —       | Encrypted operator backup bundle (RFC 0064)                               | 📋     | [8.10](epics/data-sovereignty.md#-810--encrypted-operator-backup-bundle-rfc-0064)                                           |
| —       | Git-backed backup remote (RFC 0064)                                       | 📋     | [8.11](epics/data-sovereignty.md#-811--git-backed-backup-remote-rfc-0064)                                                   |
| —       | Backup retention, deletion, and scoped restore guards (RFC 0064)          | 📋     | [8.12](epics/data-sovereignty.md#-812--backup-retention-deletion-and-scoped-restore-guards-rfc-0064)                        |
| —       | Plugin background jobs and schedules (RFC 0046)                           | 📋     | [3.16](epics/plugins-runtime.md#-316--plugin-background-jobs-and-schedules-rfc-0046)                                        |
| —       | Public plugin page routes (RFC 0042)                                      | 📋     | [2.14](epics/platform-shell.md#-214--public-plugin-page-routes-rfc-0042)                                                    |
| —       | Public plugin webhooks (RFC 0050)                                         | 📋     | [2.15](epics/platform-shell.md#-215--public-plugin-webhooks-rfc-0050)                                                       |
| —       | Error-page digital-rights quote rotation                                  | 📋     | [2.20](epics/platform-shell.md#-220--error-page-digital-rights-quote-rotation)                                              |
| —       | Plugin access policy enforcement (RFC 0065)                               | 📋     | [2.21](epics/platform-shell.md#-221--plugin-access-policy-enforcement-rfc-0065)                                             |
| —       | Plugin events and realtime channels (RFC 0045)                            | 📋     | [3.17](epics/plugins-runtime.md#-317--plugin-events-and-realtime-channels-rfc-0045)                                         |
| —       | Plugin tool contracts (RFC 0047)                                          | 📋     | [3.18](epics/plugins-runtime.md#-318--plugin-tool-contracts-rfc-0047)                                                       |
| —       | Plugin external connections (RFC 0049)                                    | ✅     | [3.19](epics/plugins-runtime.md#-319--plugin-external-connections-rfc-0049)                                                 |
| —       | Cross-plugin references and dependency discovery (RFC 0051)               | ✅     | [3.20](epics/plugins-runtime.md#-320--cross-plugin-references-and-dependency-discovery-rfc-0051)                            |
| —       | Plugin flow handoffs (RFC 0053)                                           | 📋     | [3.21](epics/plugins-runtime.md#-321--plugin-flow-handoffs-rfc-0053)                                                        |
| —       | Email channel for broadcasts and messages (RFC 0062)                      | 📋     | [4.5](epics/notification-center.md#-45--email-channel-for-broadcasts-and-messages-rfc-0062)                                 |
| —       | Sovereign Harness platform plugin (RFC 0040)                              | 📋     | [18.1](epics/sovereign-harness.md#-181--sovereign-harness-platform-plugin-rfc-0040)                                         |
| —       | Sovereign Council POC (RFC 0055)                                          | 📋     | [19.1](epics/sovereign-council.md#-191--sovereign-council-poc-rfc-0055)                                                     |
| —       | Sovereign Council full deliberation workspace                             | 📋     | [19.2](epics/sovereign-council.md#-192--sovereign-council-full-deliberation-workspace)                                      |
| —       | Core Assistant shell and disabled state (RFC 0063)                        | 📋     | [22.1](epics/core-assistant.md#-221--core-assistant-shell-and-disabled-state-rfc-0063)                                      |
| —       | Assistant provider client and fake-provider tests (RFC 0063)              | 📋     | [22.2](epics/core-assistant.md#-222--assistant-provider-client-and-fake-provider-tests-rfc-0063)                            |
| —       | Optional local inference sidecar (RFC 0063)                               | 📋     | [22.3](epics/core-assistant.md#-223--optional-local-inference-sidecar-rfc-0063)                                             |
| —       | Platform-owned assistant tools and confirmation flow (RFC 0063)           | 📋     | [22.4](epics/core-assistant.md#-224--platform-owned-assistant-tools-and-confirmation-flow-rfc-0063)                         |
| —       | Assistant history, preferences, and extension review (RFC 0063)           | 📋     | [22.5](epics/core-assistant.md#-225--assistant-history-preferences-and-extension-review-rfc-0063)                           |
| —       | Middleware decomposition                                                  | 📋     | [2.17](epics/platform-shell.md#-217--middleware-decomposition)                                                              |
| —       | Generate script decomposition                                             | 📋     | [3.23](epics/plugins-runtime.md#-323--generate-script-decomposition)                                                        |
| —       | Account plugin workflow coverage                                          | 📋     | [14.2](epics/plugin-accounts.md#-142--account-plugin-workflow-coverage)                                                     |
| —       | Console plugin workflow coverage                                          | 📋     | [13.5](epics/plugin-console.md#-135--console-plugin-workflow-coverage)                                                      |
| —       | Console primitive migration, Phase 2                                      | 📋     | [13.6](epics/plugin-console.md#-136--console-primitive-migration-phase-2)                                                   |
| —       | Console plugin access management (RFC 0065)                               | 📋     | [13.7](epics/plugin-console.md#-137--console-plugin-access-management-rfc-0065)                                             |
| —       | Launcher plugin workflow coverage                                         | 📋     | [15.2](epics/plugin-launcher.md#-152--launcher-plugin-workflow-coverage)                                                    |
| —       | SDK boundary and runtime contract tests                                   | 📋     | [3.24](epics/plugins-runtime.md#-324--sdk-boundary-and-runtime-contract-tests)                                              |
| —       | Plugin external dependency resolution (RFC 0057)                          | 📋     | [3.25](epics/plugins-runtime.md#-325--plugin-external-dependency-resolution-rfc-0057)                                       |
| —       | Plugin mailer permission and SDK email surface (RFC 0062)                 | 📋     | [3.26](epics/plugins-runtime.md#-326--plugin-mailer-permission-and-sdk-email-surface-rfc-0062)                              |
| —       | Admin-managed external provider configuration                             | ✅     | [3.27](epics/plugins-runtime.md#-327--admin-managed-external-provider-configuration)                                        |
| —       | Middleware internal fetch caching review                                  | 📋     | [2.18](epics/platform-shell.md#-218--middleware-internal-fetch-caching-review)                                              |
| —       | Typecheck performance and project references                              | 📋     | [0.14](epics/infrastructure.md#-014--typecheck-performance-and-project-references)                                          |
| —       | Operational consistency checks                                            | 📋     | [0.15](epics/infrastructure.md#-015--operational-consistency-checks)                                                        |
| —       | Pre-v1 stabilization gate                                                 | 📋     | [0.16](epics/infrastructure.md#-016--pre-v1-stabilization-gate)                                                             |
| —       | Sovereign Wallet scaffold (RFC 0061)                                      | 📋     | [21.1](epics/sovereign-wallet.md#-211--sovereign-wallet-scaffold-rfc-0061)                                                  |
| —       | Sovereign Wallet loyalty card storage and QR/barcode rendering            | 📋     | [21.2](epics/sovereign-wallet.md#-212--loyalty-card-storage-and-qrbarcode-rendering)                                        |
| —       | Sovereign Wallet encrypted document snapshots                             | 📋     | [21.3](epics/sovereign-wallet.md#-213--encrypted-document-snapshots)                                                        |
| —       | Sovereign Wallet portability and deletion hooks                           | 📋     | [21.4](epics/sovereign-wallet.md#-214--wallet-portability-and-deletion-hooks)                                               |
| —       | Chat protocol selection and Veilid feasibility spike (RFC 0066)           | 📋     | [23.1](epics/p2p-chat.md#-231--protocol-selection-and-veilid-feasibility-spike-rfc-0066)                                    |
| —       | Chat companion app and deployment scaffold (RFC 0066)                     | 📋     | [23.2](epics/p2p-chat.md#-232--chat-companion-app-and-deployment-scaffold)                                                  |
| —       | Sovereign Chat Launch Profile and cookie boundary (RFC 0066)              | 📋     | [23.3](epics/p2p-chat.md#-233--sovereign-chat-launch-profile-and-cookie-boundary)                                           |
| —       | Chat identity, addresses, and instance discovery (RFC 0066)               | 📋     | [23.4](epics/p2p-chat.md#-234--chat-identity-addresses-and-instance-discovery)                                              |
| —       | Chat device enrollment, recovery, and revocation (RFC 0066)               | 📋     | [23.5](epics/p2p-chat.md#-235--device-enrollment-recovery-and-revocation)                                                   |
| —       | Veilid transport adapter and signed route discovery (RFC 0066)            | 📋     | [23.6](epics/p2p-chat.md#-236--veilid-transport-adapter-and-signed-route-discovery)                                         |
| —       | One-to-one E2EE messaging MVP (RFC 0066)                                  | 📋     | [23.7](epics/p2p-chat.md#-237--one-to-one-e2ee-messaging-mvp)                                                               |
| —       | Encrypted offline delivery, attachments, and notifications (RFC 0066)     | 📋     | [23.8](epics/p2p-chat.md#-238--encrypted-offline-delivery-attachments-and-notifications)                                    |
| —       | Chat same-instance hardening and deletion (RFC 0066)                      | 📋     | [23.9](epics/p2p-chat.md#-239--same-instance-release-hardening-portability-and-deletion)                                    |
| —       | Chat cross-instance federation and trust policy (RFC 0066)                | 📋     | [23.10](epics/p2p-chat.md#-2310--cross-instance-federation-and-trust-policy)                                                |
| —       | Chat group messaging and membership security (RFC 0066)                   | 📋     | [23.11](epics/p2p-chat.md#-2311--group-messaging-and-membership-security)                                                   |
| —       | Chat native transport and background delivery adapters (RFC 0066)         | 📋     | [23.12](epics/p2p-chat.md#-2312--native-transport-and-background-delivery-adapters)                                         |

---

## Desktop

Native Tauri shell wrapping the PWA — direct `.dmg`/`.exe`/`.AppImage` download,
macOS first. Out of scope for v1; the approach is decided (see CLAUDE.md
"Desktop app (post-v1 plan)" and RFC 0038) and lives in the separate
`sovereign-desktop` repository.

### Pre-v1

| Version | Task                                      | Status | Epic task                                                                          |
| ------- | ----------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| 0.1.0   | Desktop app shell, macOS-first (RFC 0038) | ✅     | [17.1](epics/desktop.md#-171--sovereign-desktop--tauri-shell-scaffold-macos-first) |

---

### Non-prioritised tasks

| Version | Task                                                      | Status | Epic task                                                            |
| ------- | --------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| —       | Desktop: system tray and OS notifications (RFC 0038)      | 📋     | [17.2](epics/desktop.md#-172--system-tray-and-os-notifications)      |
| —       | Desktop: deep link scheme `sovereign://` (RFC 0038)       | 📋     | [17.3](epics/desktop.md#-173--deep-link-scheme-sovereign)            |
| —       | Desktop: keychain credential storage (RFC 0038)           | 📋     | [17.4](epics/desktop.md#-174--keychain-credential-storage)           |
| —       | Desktop: auto-updater (RFC 0038)                          | 📋     | [17.5](epics/desktop.md#-175--auto-updater)                          |
| —       | Desktop: Mac App Store distribution (RFC 0038)            | 📋     | [17.6](epics/desktop.md#-176--mac-app-store-distribution)            |
| —       | SDK `"desktop"` environment for `sdk.device.*` (RFC 0038) | 📋     | [17.7](epics/desktop.md#-177--sdk-desktop-environment-for-sdkdevice) |

---

## Mobile

Native Capacitor shell wrapping the PWA — one binary for the App Store / Play
Store. Out of scope for v1; the approach is decided (see CLAUDE.md "Native
mobile app (post-v1 plan)" and SRS §3.12) and lives in a separate
`sovereign-mobile` repository once work starts.

### Non-prioritised tasks

| Version | Task                                                             | Status | Epic task                                                                           |
| ------- | ---------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| —       | Mobile app shell, iOS and Android (RFC 0058)                     | 📋     | [20.1](epics/mobile.md#-201--sovereign-mobile--capacitor-shell-scaffold)            |
| —       | Mobile instance validation and compatibility endpoint (RFC 0058) | 📋     | [20.2](epics/mobile.md#-202--mobile-instance-validation-and-compatibility-endpoint) |
| —       | Mobile SDK native environment and bridge adapter (RFC 0058)      | 📋     | [20.3](epics/mobile.md#-203--mobile-sdk-native-environment-and-bridge-adapter)      |
| —       | Mobile store release setup and privacy declarations (RFC 0058)   | 📋     | [20.4](epics/mobile.md#-204--mobile-store-release-setup-and-privacy-declarations)   |
| —       | Mobile native push notifications (RFC 0058)                      | 📋     | [20.5](epics/mobile.md#-205--native-push-notifications-apnsfcm)                     |
| —       | Mobile native photo picker and camera capture (RFC 0058)         | 📋     | [20.6](epics/mobile.md#-206--native-photo-picker-and-camera-capture)                |
| —       | Mobile biometric auth capability (RFC 0058)                      | 📋     | [20.7](epics/mobile.md#-207--biometric-auth-capability)                             |
| —       | Mobile haptics capability (RFC 0058)                             | 📋     | [20.8](epics/mobile.md#-208--haptics-capability)                                    |
| —       | Mobile background capability planning (RFC 0058)                 | 📋     | [20.9](epics/mobile.md#-209--background-capability-planning)                        |
