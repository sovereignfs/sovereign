# Sovereign — Epics Overview

A domain-first map of all Sovereign work streams, cross-cutting the phase-sequenced [roadmap](../roadmap.md). Each epic collects related tasks regardless of when they shipped or are planned. Tasks within each epic carry a stable ID (`<epic>.<seq>`) that can be cited in PRs, RFCs, and commits.

Full architecture and requirements: [sovereign-proposal-plan-srs.md](../sovereign-proposal-plan-srs.md). Task lifecycle and workflow: [development-workflow.md](../development-workflow.md).

## Epics

| ID  | Epic                                          | Status         | Summary                                                                             |
| --- | --------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| 0   | [Infrastructure](infrastructure.md)           | ⏳ In Progress | Monorepo, Docker, CI, testing pipeline, non-Docker deployment                       |
| 1   | [Users & Auth](users-auth.md)                 | ⏳ In Progress | Authentication, session management, MFA, roles, capabilities, account deletion      |
| 2   | [Platform Shell](platform-shell.md)           | ✅ Complete    | Runtime host, middleware, shell modes, SDK bridge, security headers                 |
| 3   | [Plugins Runtime](plugins-runtime.md)         | ⏳ In Progress | Manifest system, generate script, SDK contract, plugin lifecycle, registry          |
| 4   | [Notification Center](notification-center.md) | ⏳ In Progress | In-app inbox, toasts, web push, pluggable pub/sub transport                         |
| 5   | [Activity Logs](activity-logs.md)             | ✅ Complete    | Audit trail for user and admin actions across the platform                          |
| 6   | [Analytics](analytics.md)                     | 📋 Planned     | Self-hosted, privacy-first usage analytics with DNT/GPC enforcement                 |
| 7   | [Monetization](monetization.md)               | ⏳ In Progress | Plugin billing model, Ed25519 entitlement tokens, payment integrations              |
| 8   | [Data Sovereignty](data-sovereignty.md)       | ⏳ In Progress | Backup/restore, portability export/import, per-plugin DB, data deletion, encryption |
| 9   | [Theming](theming.md)                         | ⏳ In Progress | Design system, white-labeling, instance identity, email templates, Storybook        |
| 10  | [Accessibility](accessibility.md)             | ✅ Complete    | WCAG 2.1 AA audit, a11y lint rules, plugin developer a11y contract                  |
| 11  | [i18n](i18n.md)                               | 📋 Planned     | Internationalization infrastructure and built-in translations                       |
| 12  | [Example Plugins](example-plugins.md)         | ✅ Complete    | Plugin starter templates and capability-demo example plugins                        |
| 13  | [Plugin — Console](plugin-console.md)         | ✅ Complete    | Admin console: user management, plugin management, settings, health                 |
| 14  | [Plugin — Accounts](plugin-accounts.md)       | ✅ Complete    | Per-user profile, security, preferences, data portability, activity                 |
| 15  | [Plugin — Launcher](plugin-launcher.md)       | ✅ Complete    | Home screen plugin grid — default root plugin                                       |
| 16  | [Docs Site & Landing Page](docs.md)           | ⏳ In Progress | VitePress site from docs/ + project landing page at sovereignfs.github.io           |
| 17  | [Desktop App Shell](desktop.md)               | ⏳ In Progress | Tauri shell app loading a self-hosted instance — macOS-first                        |
| 18  | [Sovereign Harness](sovereign-harness.md)     | 📋 Planned     | Platform-shipped AI assistant and orchestration layer                               |
| 19  | [Sovereign Council](sovereign-council.md)     | 📋 Planned     | Multi-model deliberation, brainstorming, and report generation                      |
| 20  | [Mobile App Shell](mobile.md)                 | 📋 Planned     | Capacitor shell app loading a self-hosted instance — iOS and Android                |
| 21  | [Sovereign Wallet](sovereign-wallet.md)       | 📋 Planned     | Encrypted wallet for QR loyalty cards and sensitive document snapshots              |
| 22  | [Core Assistant](core-assistant.md)           | 📋 Planned     | First Harness runtime phase: Jarvis workspace assistant and local inference         |

_Status key: ✅ Complete · ⏳ In Progress · 📋 Planned_
