# Epic 16: Docs Site & Landing Page

> Public VitePress site that renders `docs/` as navigable web documentation and
> serves as the project's landing page.

## Status

⏳ In Progress

## Overview

Sovereign's documentation lives in `docs/` as Markdown and is currently only
readable as raw files on GitHub. This epic adds a VitePress workspace app
(`apps/docs/`) that builds a static site from that content without moving or
duplicating any files — `docs/` remains the one source of truth.

The same site doubles as the project's landing page via a VitePress home layout
page, eliminating the need for a separate marketing site at v1. A GitHub Actions
workflow deploys the static output to `sovereignfs/sovereignfs.github.io` on
`docs-v*` tag pushes, serving the public site at `https://sovereignfs.github.io/`.

The two tasks are sequenced: scaffold the navigable docs site first (so the full
documentation is immediately browsable and the deploy pipeline is live), then
layer on the landing home page (so first-time visitors are oriented before diving
into docs).

## Tasks

#### ✅ 16.1 — apps/docs — VitePress workspace scaffold

**Goal:** Create `apps/docs/` as a pnpm workspace package containing a VitePress
1.x config with `srcDir: '../../docs'`, full sidebar navigation matching the
existing docs structure, and local full-text search. Running
`pnpm --filter @sovereignfs/docs dev` opens the site at localhost:5173. Merges
with a `docs-v*` tag trigger a deploy job that publishes the built site to
`sovereignfs/sovereignfs.github.io`.

**Deliverables:**

- `apps/docs/package.json` — `name: "@sovereignfs/docs"`, `private: true`;
  devDeps: `vitepress@^1`; scripts: `dev`, `build`, `preview`
- `apps/docs/tsconfig.json` — extends `@sovereignfs/tsconfig/base.json`
- `apps/docs/.vitepress/config.ts` — `defineConfig` with:
  - `srcDir: '../../docs'`, `outDir: '.vitepress/dist'`
  - `title: 'Sovereign'`, `description`
  - `themeConfig.nav` — Guide, Plugin Dev, Design System, RFCs, GitHub link
  - `themeConfig.sidebar` — sections: Getting Started (self-hosting, architecture,
    security, upgrade, troubleshooting), Plugin Development (plugin-development,
    sdk-stability, plugin-database, design-system), Core Plugins (console,
    launcher, account), Contributing (development-workflow, architecture-rules,
    testing-e2e, roadmap), RFCs
  - `themeConfig.search: { provider: 'local' }`
  - `themeConfig.socialLinks` — GitHub repo link
- `apps/docs/.vitepress/theme/index.ts` — re-exports default VitePress theme
  (placeholder for future custom theme)
- `turbo.json` update — add `@sovereignfs/docs#build` with
  `outputs: ['apps/docs/.vitepress/dist/**']`; no inter-package dependency needed
- `.github/workflows/docs.yml` — two jobs:
  - `build`: triggered on PRs with path filter `docs/**` or `apps/docs/**`;
    runs `pnpm --filter @sovereignfs/docs build` (smoke-test, no deploy)
  - `deploy`: triggered on `docs-v*` tag push (or `workflow_dispatch`); builds
    then pushes `apps/docs/.vitepress/dist/` to `sovereignfs/sovereignfs.github.io`
    via `peaceiris/actions-gh-pages@v4` using PAT secret `DOCS_DEPLOY_TOKEN`

**Prerequisites (manual):** generate a GitHub PAT with `repo` scope for
`sovereignfs/sovereignfs.github.io`; add it as secret `DOCS_DEPLOY_TOKEN` in
this repo's Actions settings.

**SRS reference:** §1.1 (open-source, self-hostable positioning), §3.14 (developer
experience)

**Review checklist:**

- `pnpm --filter @sovereignfs/docs dev` starts without error at localhost:5173
- All top-level `docs/*.md` files reachable via sidebar links
- Local search returns results for "plugin", "auth", "SDK"
- `pnpm --filter @sovereignfs/docs build` exits 0 and emits `apps/docs/.vitepress/dist/`
- CI `build` job passes on a test PR touching `docs/architecture.md`
- On `docs-v*` tag push, `deploy` job runs and `https://sovereignfs.github.io/` updates
- `pnpm lint` and `pnpm format:check` pass (apps/docs/ is in lint scope)
- No content copied or symlinked into `apps/docs/` — all sidebar links resolve via srcDir

#### ✅ 16.2 — docs/index.md — Landing home page

**Goal:** Add `docs/index.md` using VitePress built-in `layout: home` frontmatter
so the site root shows a proper landing page — hero headline, feature tiles, and
CTA buttons linking to the self-hosting guide and the GitHub repo.

**Deliverables:**

- `docs/index.md` — frontmatter with:
  - `layout: home`
  - `hero`: name ("Sovereign"), tagline, actions (`{ text: 'Get Started',
link: '/self-hosting' }` + `{ text: 'GitHub', link: '...', theme: 'alt' }`)
  - `features`: 6–8 tiles covering self-hostable, privacy-first, plugin-first,
    single-tenant/multi-user, SDK contract, design system, Docker-ready, open source
- `apps/docs/.vitepress/config.ts` minor update — verify `themeConfig.logo` path
  if a logo asset exists in the repo

**SRS reference:** §1.1, §1.2 (product positioning)

**Review checklist:**

- Visiting `http://localhost:5173/` shows hero + feature tiles (not raw Markdown)
- "Get Started" CTA navigates to the self-hosting guide page
- "GitHub" link has the correct `href`
- Dark mode toggle renders the home page without contrast issues
- `pnpm --filter @sovereignfs/docs build` exits 0 after adding `docs/index.md`
- No existing `docs/*.md` file is modified — `docs/index.md` is purely additive

---

#### ✅ 16.3 — Current-state testing documentation cleanup

**Goal:** Bring test documentation back in sync with the current codebase so
contributors and release reviewers can trust the repo docs before v1.

**Deliverables:**

- Update `__tests__/e2e/README.md` so it reflects the current Playwright suite,
  fixtures, seed prerequisites, and local run flow.
- Add a compact test matrix to the documentation covering:
  - Vitest unit/component scope.
  - Playwright E2E scope.
  - Postgres parity tests via `TEST_DATABASE_URL`.
  - Why generated plugin route copies are excluded from test discovery.
- Document the expected behavior of `pnpm test` and `pnpm test:e2e` in one
  stable place.
- Consider a docs-parity check for E2E documentation if there is a stable signal
  that can be tested without brittle prose assertions.

**Dependencies:** Task 0.12 (E2E golden-path test suite), Task 3.5 (test
organization).

**SRS reference:** NFR-11, RFC 0010.

**Review checklist:**

- No docs claim the E2E suite is empty.
- Test commands and prerequisites are documented in one place.
- `pnpm test` and `pnpm test:e2e` behavior is accurately described.

---

#### ✅ 16.4 — Product-led docs site and instance directory (RFC 0067)

**Goal:** Reframe the public site around product education, hosted-instance
discovery, and audience-oriented documentation while preserving the existing
technical reference material and VitePress build.

**Deliverables:**

- Add product, instance-directory, role-based getting-started, public roadmap,
  and audience-oriented guide pages under `docs/`.
- Update VitePress navigation, sidebars, metadata, theme styles, and public
  assets for the new information architecture.
- Keep internal planning pages out of the public build and retain compatibility
  paths for existing technical documentation.
- Document the trust boundary for independently operated instances and use
  availability labels for public product claims.

**SRS reference:** [RFC 0067](../rfcs/0067-product-led-docs-site.md), §1.1, §1.2.

**Review checklist:**

- Product, Instances, Get Started, Roadmap, and Docs are reachable from global navigation.
- Audience paths distinguish users, operators, app developers, architects, and contributors.
- Instance listings disclose operator responsibility and verification state.
- `pnpm --filter @sovereignfs/docs build` succeeds and internal planning pages remain excluded.

## Related RFCs

- [RFC 0037 — VitePress public docs site and project landing page](../rfcs/0037-vitepress-docs-site.md)
- [RFC 0067 — Product-led docs site and instance directory](../rfcs/0067-product-led-docs-site.md)

## Related Docs

- [self-hosting.md — Primary "Get Started" destination](../self-hosting.md)
- [development-workflow.md — Task workflow](../development-workflow.md)

## Cross-references

- Epic 0 (Infrastructure) — CI pipeline; `docs.yml` follows the same pattern as
  the existing `storybook-build` CI job added in task 1.0.08
- Epic 9 (Theming) — if a custom VitePress theme is added post-v1, it will consume
  `--sv-*` design tokens from `packages/ui`
