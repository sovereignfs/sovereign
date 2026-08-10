---
docSection: architecture-security
docType: reference
audiences:
  - operator
  - app-developer
  - contributor
---

# Sovereign repositories

Sovereign uses a small set of first-party repositories. This page is the
canonical map for what each repository owns, whether it is active or archived,
and which docs should point to it.

## Core repositories

| Repository                                                                        | Status   | Purpose                                                                                                                             |
| --------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`sovereignfs/sovereign`](https://github.com/sovereignfs/sovereign)               | Active   | Primary platform repository: runtime, auth app, packages, built-in platform plugins, docs, RFCs, and roadmap.                       |
| [`sovereignfs/sovereign-legacy`](https://github.com/sovereignfs/sovereign-legacy) | Archived | Previous Sovereign codebase. Kept for historical reference and migration context only; new work happens in `sovereignfs/sovereign`. |

## Client shell repositories

Native client shells that load a user's self-hosted instance in a WebView. They
own only shell concerns — instance-URL onboarding, persistent instance storage,
WebView lifecycle, native permission declarations, store metadata. Auth, plugins,
shell layout, and CSP always come from the user's own instance. See
[CLAUDE.md](../CLAUDE.md) ("Native mobile app" / "Desktop app"),
[RFC 0058](rfcs/0058-native-mobile-app-shell.md), and
[RFC 0038](rfcs/0038-desktop-app-shell.md).

| Repository                                                                          | Status | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`sovereignfs/sovereign-desktop`](https://github.com/sovereignfs/sovereign-desktop) | Active | Tauri 2.x desktop shell — macOS first, Windows and Linux from the same codebase. Distributed via GitHub Releases (`.dmg`, `.exe`/`.msi`, `.AppImage`/`.deb`). Epic 17.                                                                                                                                                                                                                                                                                                  |
| [`sovereignfs/sovereign-mobile`](https://github.com/sovereignfs/sovereign-mobile)   | Active | Capacitor shell for iOS and Android, published to the App Store and Play Store, plus a device-bridge layer (RFC 0083) for `sdk.device.*`. Scaffolded by epic task 20.1 (2026-08); tracked as [workstream 0002](workstreams/0002-native-mobile-app-release.md). Verified against a real instance on iOS Simulator and Android Emulator — real physical-device verification and public store release are still outstanding (see the workstream doc's Definition of done). |

## Plugin repositories

Individual product plugin repositories (Tasks, Plainwrite, and any other
first-party or community plugin) are tracked in the plugin registry
(`registry/plugins.json`), not in a table on this page — see
[`registry/CONTRIBUTING.md`](../registry/CONTRIBUTING.md) for the submission
process. The one exception is
[`sovereignfs/sovereign-plugin-template`](https://github.com/sovereignfs/sovereign-plugin-template),
the canonical standalone plugin starter repository — it isn't itself an
installable plugin, so it has no registry entry.

`sovereignfs/sovereign-plugins-examples` has been retired: the example
plugins it previously hosted now live in-repo under `example-plugins/` (see
`docs/epics/example-plugins.md`).

## Documentation and deployment support

| Repository                                                                                  | Status                   | Purpose                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`sovereignfs/storybook`](https://github.com/sovereignfs/storybook)                         | Active deployment target | GitHub Pages repository for the built `@sovereignfs/ui` Storybook static site, served at [`sovereignfs.github.io/storybook`](https://sovereignfs.github.io/storybook/). Source stories live in this primary repository under `packages/ui`.                                                             |
| [`sovereignfs/sovereign-infra`](https://github.com/sovereignfs/sovereign-infra)             | Active template          | Operator-owned self-hosting template for Ubuntu VPS deployments: Caddy, Docker Compose, age-encrypted `.env` files, matching-tag deploys of official Sovereign images, and GitHub Actions CI/CD. No Terraform or managed-cloud dependency.                                                              |
| [`sovereignfs/sovereignfs`](https://github.com/sovereignfs/sovereignfs)                     | Active                   | The ecosystem workbench repo. Builds and deploys the public VitePress docs site (`docs/` there) by fetching allowlisted content from this repository's `docs/` (and `sovereign-os`'s) at build time via `docs/docs-sync.manifest.json` — this repository holds the source prose, but no docs-site code. |
| [`sovereignfs/sovereignfs.github.io`](https://github.com/sovereignfs/sovereignfs.github.io) | Active deployment target | GitHub Pages repository for the public docs site at [`sovereignfs.github.io`](https://sovereignfs.github.io/), published from `sovereignfs/sovereignfs`. Source prose lives in this primary repository under `docs/`; the VitePress app and build config live in `sovereignfs/sovereignfs`, not here.   |

## Naming notes

- Product plugin repositories follow `sovereignfs/sovereign-plugin-<name>`
  (e.g. `sovereign-plugin-tasks`, `sovereign-plugin-plainwrite`) — the
  `plugin-` segment distinguishes an installable plugin repo from platform and
  client-shell repos at a glance. This does not affect a plugin's own
  `package.json` name or manifest `id`, which are unrelated to its repo name.
- `sovereignfs/storybook` and `sovereignfs/sovereignfs.github.io` are deployment
  targets. Edit source stories and docs in `sovereignfs/sovereign`.
- `sovereignfs/sovereign-infra` is a template that operators fork or use as a
  GitHub template. The platform repository publishes release images; the
  operator's infra repository controls when those images are deployed to the
  operator's VPS.
- Historical planning docs may mention older candidate repositories such as
  Splitify, API Composer, or PaperTrail. They are not part of the
  current support-repository set unless this page is updated.
