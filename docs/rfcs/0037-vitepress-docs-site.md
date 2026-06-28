---
rfc: 0037
title: VitePress public docs site and project landing page
status: Implemented
date: June 2026
author: kasunben
scope: apps/docs, docs/index.md, pnpm-workspace.yaml, turbo.json, .github/workflows
incorporated_into_plan: 'Yes — epic tasks 16.1, 16.2'
---

## Summary

Add `apps/docs/` — a VitePress 1.x workspace app whose `srcDir` points at the
repo-root `docs/` directory. The site serves the existing Markdown documentation
as a navigable, searchable web property and doubles as the project landing page
via a VitePress home layout page (hero + feature tiles + CTA links).

`docs/` remains the one source of truth; no content moves or duplicates. A
GitHub Actions workflow builds the site on every PR touching documentation and
deploys the static output to `sovereignfs/sovereignfs.github.io` on every merge
to `main`, serving the public site at `https://sovereignfs.github.io/`.

## Motivation

Sovereign's documentation is comprehensive but only readable as raw Markdown on
GitHub. A rendered site with sidebar navigation, full-text search, and anchor
links lowers the barrier for self-hosters, plugin developers, and contributors.

Serving the landing page from the same site also removes the need for a separate
marketing site at v1 — one URL covers both "learn about Sovereign" and "read the
docs." Deploying to a dedicated GitHub Pages repo (`sovereignfs.github.io`) keeps
the docs site on a clean root URL without a subpath.

## Current state

- `docs/` — 26 root-level `.md` files + `epics/`, `rfcs/`, `plugins/`, `rfcs/` subdirs.
  No static site tooling; consumed as raw Markdown.
- `apps/auth/` — existing Next.js workspace app; establishes the `apps/*` pattern.
- `turbo.json` — build pipeline with `build`, `dev`, `typecheck`, `lint`, and
  `build-storybook` tasks.
- `pnpm-workspace.yaml` — `packages: ['apps/*', 'packages/*', 'plugins/*']`;
  `apps/*` glob picks up `apps/docs/` automatically once the directory exists.
- `.github/workflows/` — existing CI jobs for lint, test, e2e, storybook-build.

## Proposed design

### `apps/docs/` structure

```
apps/docs/
  package.json            name: @sovereignfs/docs, private: true
  tsconfig.json           extends @sovereignfs/tsconfig/base.json
  .vitepress/
    config.ts             srcDir, title, nav, sidebar, search
    theme/
      index.ts            re-exports default VitePress theme (placeholder)
```

The `srcDir` in `.vitepress/config.ts` is set to `../../docs` (relative to
`apps/docs/`), so VitePress reads directly from the repo-root `docs/` directory.
No content is copied or symlinked.

### Key VitePress config

```ts
// apps/docs/.vitepress/config.ts
import { defineConfig } from 'vitepress';

export default defineConfig({
  srcDir: '../../docs',
  outDir: '.vitepress/dist',
  title: 'Sovereign',
  description: 'Self-hostable workspace runtime',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/self-hosting' },
      { text: 'Plugin Dev', link: '/plugin-development' },
      { text: 'Design System', link: '/design-system' },
      { text: 'RFCs', link: '/rfcs/' },
      { text: 'GitHub', link: 'https://github.com/sovereignfs/sovereign' },
    ],
    sidebar: {
      '/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Self-Hosting', link: '/self-hosting' },
            { text: 'Architecture', link: '/architecture' },
            { text: 'Security', link: '/security' },
            { text: 'Upgrade Guide', link: '/upgrade' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
          ],
        },
        {
          text: 'Plugin Development',
          items: [
            { text: 'Overview', link: '/plugin-development' },
            { text: 'SDK Stability', link: '/sdk-stability' },
            { text: 'Plugin Database', link: '/plugin-database' },
            { text: 'Design System', link: '/design-system' },
          ],
        },
        {
          text: 'Core Plugins',
          items: [
            { text: 'Console', link: '/plugins/console' },
            { text: 'Launcher', link: '/plugins/launcher' },
            { text: 'Account', link: '/plugins/account' },
          ],
        },
        {
          text: 'Contributing',
          items: [
            { text: 'Development Workflow', link: '/development-workflow' },
            { text: 'Architecture Rules', link: '/architecture-rules' },
            { text: 'Testing E2E', link: '/testing-e2e' },
            { text: 'Roadmap', link: '/roadmap' },
          ],
        },
        { text: 'RFCs', link: '/rfcs/' },
      ],
    },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/sovereignfs/sovereign' }],
  },
});
```

### Landing home page

`docs/index.md` (the only new file added to `docs/`) uses VitePress built-in
`layout: home` frontmatter with a `hero` block and `features` tiles. No custom
theme component is needed for v1.

### Turbo integration

Two new task entries in `turbo.json`:

- `@sovereignfs/docs#build` — outputs `apps/docs/.vitepress/dist/**`; no
  dependency on other workspace packages (VitePress reads source directly).
- The global `dev` task already covers all persistent dev servers — no change needed.

### CI + deployment

`.github/workflows/docs.yml` — two jobs:

**`build`** (runs on every PR with path filter `docs/**` or `apps/docs/**`):

```yaml
- run: pnpm --filter @sovereignfs/docs build
```

Smoke-tests the build without deploying.

**`deploy`** (runs on push to `main` with the same path filter):

Builds the site then pushes `apps/docs/.vitepress/dist/` to
`sovereignfs/sovereignfs.github.io` via `peaceiris/actions-gh-pages@v4` using
a repository deploy key stored as secret `DOCS_DEPLOY_KEY` in this repo.
The target repo must have the corresponding public key added as a deploy key
with write access.

Live URL: `https://sovereignfs.github.io/`

## Alternatives considered

- **Option A (`docs/.vitepress/`)**: VitePress config inside `docs/`. Rejected
  because it adds `node_modules`, a `package.json`, and lockfile noise to a
  directory that is currently pure prose — confusing for contributors editing docs.
- **Option C (repo root config)**: Single `.vitepress/` at the repo root.
  Rejected because it couples the docs build to the root `package.json` script
  namespace and muddies the turbo dependency graph.
- **Vercel / Netlify deploy**: Considered instead of GitHub Pages. Rejected for
  now — GitHub Pages on `sovereignfs.github.io` is free, zero-config, and fits
  the open-source identity. Can be added later if custom domain or preview deploys
  are needed.

## Open questions

1. Should `docs/rfcs/` be included in the public sidebar, or kept as a
   GitHub-browsable-only section? (RFCs are developer-facing process docs, not
   end-user docs — a `collapsed: true` sidebar group may be the right balance.)
2. Versioned docs (multiple VitePress versions) — out of scope for v1.

## Adoption path

1. RFC merges.
2. Epic task 16.1 — `apps/docs/` scaffold: dev server, full sidebar, local
   search, CI build + deploy job.
3. Epic task 16.2 — `docs/index.md` landing page: hero + feature tiles.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
