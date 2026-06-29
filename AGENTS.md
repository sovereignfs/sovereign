# AGENTS.md

Guidance for Codex working in this repository.

## What this is

**Sovereign** is a modular, self-hostable workspace runtime. A shared platform
(auth, DB, email, UI) hosts installable **plugins** as first-class apps. The
plugin system is the product, not an app extended with plugins. Open source,
privacy-first, single-tenant/multi-user in v1.

## Source of truth

Read the relevant shared docs before starting implementation:

- `docs/sovereign-proposal-plan-srs.md` — concept, plan, architecture, SRS,
  manifest reference, and decision log.
- `docs/roadmap.md` — canonical chronological task queue and task status.
- `docs/epics/` — canonical full task detail by stable epic task ID.
- `docs/development-workflow.md` — task lifecycle, roadmap/epic structure, and
  `CURRENT_TASK.md` mechanics.
- `docs/architecture-rules.md` — hard architectural rules and rationale.
- `docs/multi-agent.md` — Claude Code/Codex division of work, commit
  attribution, and the decision log behind these conventions.

`CLAUDE.md` is the Claude Code adapter. Do not treat it as Codex's instruction
entry point, and do not update it unless the user explicitly asks. If a shared
project convention still exists only in `CLAUDE.md`, follow it conservatively and
prefer moving future shared guidance into `docs/`.

## Task assignment

- The human assigns tasks explicitly. Do not auto-pick the next roadmap task.
- `docs/roadmap.md` is the queue; `docs/epics/<file>.md` holds the full task
  spec.
- Tasks are sequenced. Each task depends on the previous task unless tagged
  `[parallel]`; do not skip ahead without explicit instruction.
- Use stable epic task IDs (`<epic>.<seq>`, e.g. `11.1`) for cross-references.
  Roadmap slot versions (`0.11.0`, etc.) are ordering labels and may change.
- `CURRENT_TASK.md` is local, transient task context. Read it when present. If
  it is absent and the user assigned a task, create or reconstruct it only as
  local scratch unless the user asks for a different workflow.
- Do not add or advance a "Next Task" pointer. In-flight work is coordinated by
  the human and open PRs, not by mutable pointers in agent adapter files.

## Working conventions

- One branch per task. Keep changes scoped to the assigned task.
- Do not start a different roadmap task without explicit instruction.
- Branch from an up-to-date `main` unless the user gives a different base. Use
  `main` until v1.0.0; after v1.0.0 the integration branch becomes `dev`.
- Never merge a PR automatically. Wait for explicit human instruction.
- PRs target `main` until the post-v1 branch model changes.
- Use rebase-and-merge, never squash or merge commits. Fix commit messages
  before merging, because the task commit lands on `main` verbatim.
- Respect user or other-agent changes in the worktree. Do not revert changes
  you did not make unless explicitly asked.
- If another agent is working in this same clone for a special exercise, keep
  file ownership narrow and avoid touching files assigned to that agent.
- Docs are part of the change. Public behavior, manifest schema, SDK surface,
  env vars, Docker behavior, and operator-facing workflows require matching doc
  updates in the same PR.
- Flag Docker-config impact immediately when changes affect Dockerfiles,
  Compose files, `.dockerignore`, ports, env vars, native deps, writable paths,
  served assets, or standalone build output.
- Verify before claiming done. Run the assigned task's review checklist and
  report the commands/results.
- When a roadmap task is done, update `docs/roadmap.md` in the same PR. Mark
  the task done there; do not add completion history to `AGENTS.md`.
- Version bumps are part of the PR when required. Follow semver by change type:
  `fix/` is patch, `feat/` is minor, breaking changes are major and require an
  upgrade note, and `docs/`/`chore/` do not bump unless a public API changed.
  The root platform version tracks roadmap milestones; public `@sovereignfs/sdk`
  and `@sovereignfs/ui` follow their own compatibility constraints.

## Commit and PR conventions

- Branch names describe the change, not task numbers:
  - `feat/<slug>` for features
  - `fix/<slug>` for bug fixes
  - `docs/<slug>` for documentation
  - `chore/<slug>` for tooling, scaffolding, dependencies, and maintenance
- Do not put roadmap slot versions or doc task numbers in branch names, commit
  messages, PR titles, or PR descriptions. Describe the work by what it changes.
- Codex-authored commits should use this trailer unless local Codex commit
  attribution config specifies a different value:

  ```text
  Co-Authored-By: Codex <noreply@openai.com>
  ```

- PR descriptions should summarize what changed and why, cite relevant SRS/RFC
  sections where useful, and include verification output.
- Codex-authored PR bodies end with:
  `🤖 Generated with [Codex](https://developers.openai.com/codex)`

## Code quality

- Package manager: `pnpm`.
- Formatting: Prettier, single quotes, semicolons, trailing commas, print width
  100, two-space indentation.
- Linting: ESLint 9 flat config. Do not disable ESLint rules inline without a
  clear explanation, and never disable the SDK boundary rule.
- Prefix intentionally unused identifiers with `_`.
- Do not add per-package Prettier overrides.
- No Biome.

Common commands:

```bash
pnpm install
pnpm build
pnpm dev
pnpm format
pnpm format:check
pnpm lint
pnpm lint:fix
pnpm typecheck
pnpm test
pnpm test:watch
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:all
pnpm kill-port
pnpm install:plugins
pnpm registry:validate
pnpm registry:check
```

## Critical architectural rules

Review `docs/architecture-rules.md` before touching shared runtime, auth,
middleware, SDK, plugin loading, Docker, CSP, cookies, or database behavior.
The most common footguns:

- Plugins must not import from `runtime/src`; use `@sovereignfs/sdk`.
- `packages/sdk` must stay dependency-light and must not import host
  implementations from DB, mailer, or runtime internals.
- Always `await getPlatformDb()`, `await getConfig()`, and DB helpers.
- Secrets must not have insecure defaults.
- Do not use `NEXT_PUBLIC_*` for runtime-varying values.
- Login redirects must preserve the established `303` behavior and use the
  browser-reachable auth URL where applicable. A `307` preserves the HTTP
  method, so an unauthenticated `POST` can redirect as `POST /login` and fail
  with `405`.
- Intra-overlay navigation must use `<Link replace>`. Dialogs are dismissed
  with `router.back()`, and push-based navigation stacks history incorrectly.
- CSP must remain nonce/hash based; do not add `'unsafe-inline'` to `script-src`.
- CSP `form-action` must include the auth origin. `'self'` alone blocks the
  cross-origin logout POST redirect.
- Client components must not read browser globals during render or in
  `useState` initializers.
- New `runtime/app/api/*` segments require updating reserved API namespace
  checks.
- Profile self-mutations must clear all relevant session-data cookie variants.
- Do not remove `pnpm-workspace.yaml` from Docker build context.
- Plugin tables are slug-prefixed and user-scoped tables include `tenant_id`.
- `session.freshAge: 0` in `apps/auth/src/auth.ts` must stay disabled unless a
  re-auth flow is implemented.
- Server-to-server better-auth POSTs must send the expected `Origin` header.

## Naming and UI language

Use **plugin** for architecture, code, APIs, DB schema, manifests, CLI, and
developer docs. Use **app** for end-user UI strings and labels. End users should
not see "plugin" unless the surface is explicitly developer-facing.

For `packages/ui`, semantic tokens and component APIs are public contracts for
plugin developers. Components must use `--sv-*` tokens, not hardcoded values.
Storybook must stay current when UI components or tokens change:

- New component: add `packages/ui/src/stories/<Name>.stories.tsx` with at least
  the default state and one variant, and add it to the Component Gallery in
  `DesignSystemOverview.stories.tsx`.
- New or renamed token: update `TokenGallery.stories.tsx` and the relevant
  color/scale section of `DesignSystemOverview.stories.tsx`.
- Component API change: update story args/controls and any public import snippet
  affected by the change.
- After changing UI stories or tokens, run `pnpm --filter @sovereignfs/ui
typecheck`.

## Environment notes

- Node >=20; pnpm is pinned by the root `packageManager`.
- Shared dev tooling is pinned through the pnpm `catalog:` in
  `pnpm-workspace.yaml`. When adding `typescript` or `tsup` to a package, use
  `"catalog:"`, never a literal version. Bump the catalog once instead of
  drifting individual packages.

## Codex-specific notes

- Use Codex tools and local repo context directly; do not invoke Claude-specific
  slash commands.
- Prefer small, reviewable patches. Use repo patterns over new abstractions.
- When using subagents, keep them read-heavy or verification-focused unless the
  user explicitly asks for parallel implementation.
- For frontend work, verify rendered behavior with the browser tools when a dev
  server is needed.
