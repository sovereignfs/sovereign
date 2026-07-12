# Sovereign repositories

Sovereign uses a small set of first-party repositories. This page is the
canonical map for what each repository owns, whether it is active or archived,
and which docs should point to it.

## Core repositories

| Repository                                                                        | Status   | Purpose                                                                                                                             |
| --------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`sovereignfs/sovereign`](https://github.com/sovereignfs/sovereign)               | Active   | Primary platform repository: runtime, auth app, packages, built-in platform plugins, docs, RFCs, and roadmap.                       |
| [`sovereignfs/sovereign-legacy`](https://github.com/sovereignfs/sovereign-legacy) | Archived | Previous Sovereign codebase. Kept for historical reference and migration context only; new work happens in `sovereignfs/sovereign`. |

## Plugin repositories

| Repository                                                                                            | Status          | Purpose                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`sovereignfs/sovereign-plugin-template`](https://github.com/sovereignfs/sovereign-plugin-template)   | Active template | Canonical standalone plugin starter repository. Use this when creating a plugin outside the monorepo.                                                                                          |
| [`sovereignfs/sovereign-plugins-examples`](https://github.com/sovereignfs/sovereign-plugins-examples) | Active          | Example plugins demonstrating basic, API provider, minimal shell, monetized, and overlay app patterns. The platform bundles these at build/install time as hidden-by-default examples.         |
| [`sovereignfs/sovereign-tasks`](https://github.com/sovereignfs/sovereign-tasks)                       | Active          | Default bundled Tasks plugin. It is a real product plugin, visible from first boot, and versioned independently of the platform.                                                               |
| [`sovereignfs/sovereign-plainwrite`](https://github.com/sovereignfs/sovereign-plainwrite)             | Active          | Default bundled Plainwrite plugin — a git-backed content editor for static site generators. It is a real product plugin, visible from first boot, and versioned independently of the platform. |

## Documentation and deployment support

| Repository                                                                                  | Status                   | Purpose                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`sovereignfs/storybook`](https://github.com/sovereignfs/storybook)                         | Active deployment target | GitHub Pages repository for the built `@sovereignfs/ui` Storybook static site, served at [`sovereignfs.github.io/storybook`](https://sovereignfs.github.io/storybook/). Source stories live in this primary repository under `packages/ui`. |
| [`sovereignfs/sovereign-infra`](https://github.com/sovereignfs/sovereign-infra)             | Active template          | Operator-owned self-hosting template for Ubuntu VPS deployments: Caddy, Docker Compose, age-encrypted `.env` files, matching-tag deploys of official Sovereign images, and GitHub Actions CI/CD. No Terraform or managed-cloud dependency.  |
| [`sovereignfs/sovereignfs.github.io`](https://github.com/sovereignfs/sovereignfs.github.io) | Active deployment target | GitHub Pages repository for the public VitePress docs site at [`sovereignfs.github.io`](https://sovereignfs.github.io/). Source docs live in this primary repository under `docs/`.                                                         |

## Naming notes

- Use `sovereignfs/sovereign-plugins-examples`, not `sovereign-examples`.
- Use `sovereignfs/sovereign-tasks`, not `sovereign-plugin-tasks`.
- Use `sovereignfs/sovereign-plainwrite`, not `sovereign-plugin-plainwrite`.
- `sovereignfs/storybook` and `sovereignfs/sovereignfs.github.io` are deployment
  targets. Edit source stories and docs in `sovereignfs/sovereign`.
- `sovereignfs/sovereign-infra` is a template that operators fork or use as a
  GitHub template. The platform repository publishes release images; the
  operator's infra repository controls when those images are deployed to the
  operator's VPS.
- Historical planning docs may mention older candidate repositories such as
  Splitify, API Composer, or PaperTrail. They are not part of the
  current support-repository set unless this page is updated.
