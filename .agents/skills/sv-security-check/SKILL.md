---
name: sv-security-check
description: Review a Sovereign branch diff for security-sensitive regressions against the hard architectural rules. Use when changes touch auth, middleware, API routes, server actions, SDK/manifest surface, CSP, cookies, sessions, secrets, spawned processes, Docker/env files, or when the user asks for a security check before PR or merge.
---

# Sovereign Security Check

Targeted review of the current branch diff against the security-relevant hard
rules. Fast and scoped — runs after implementation, before the PR draft.

> **Shared skill.** This file is byte-identical in `.claude/skills/` (Claude
> Code) and `.agents/skills/` (Codex); a test enforces it.

## When to run

`sv-task-complete` triggers it when the diff touches any of:

- `apps/auth/` — auth server, session config, CSRF, rate limiting
- `runtime/proxy.ts` (Next's renamed middleware) — redirects, session verification, CSP, matcher
- `runtime/app/api/` — API routes, especially `api/admin/*` and signed-download routes
- `plugins/*/app/**/actions.ts` — server actions (public POST endpoints)
- `packages/sdk/`, `packages/manifest/` — permission and capability surface
- `bin/`, `scripts/` — anything that spawns a process
- `Dockerfile*`, `docker-compose*.yml`, `.env.example`
- any file mentioning CSP, nonce, cookie, session, secret, token, credential

Run it manually any time with `sv-security-check`.

## Workflow

1. **Read the rules:** your instruction file's "Hard architectural rules"
   summary and, for anything unclear, `docs/architecture-rules.md` (the full
   detail, including the incident that produced each rule).

2. **Scope the diff:** `git diff main...HEAD --name-only` (use the assigned
   base if not `main`). For each sensitive file, read
   `git diff main...HEAD -- <file>`.

3. **Check these rules explicitly:**

   | Rule                            | What to verify in the diff                                                                                                                                     |
   | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Server actions authorize inside | Every `'use server'` function starts with `requireSession()`; mutations also check the specific `hasCapability()`. Reads don't demand a mutation capability.   |
   | `/api/admin/*` trust            | Routes use `checkAdminKey()` only; nothing reads `x-sovereign-user-*` headers there (middleware skips this path, so they're forgeable).                        |
   | Timing-safe key compare         | Any admin/token compare uses `timingSafeEqual` on length-checked buffers, never `===`.                                                                         |
   | Middleware redirect 303         | `NextResponse.redirect` to login is `303`, not `307`, and targets `SOVEREIGN_AUTH_PUBLIC_URL`.                                                                 |
   | Middleware matcher              | A route that self-authorizes (signed token) is actually in the matcher's exclusion list; a doc comment is not proof. No `api/instance`-style prefix collision. |
   | Edge discipline                 | `runtime/proxy.ts` gains no Node built-ins, `ioredis`, or DB access (it runs on Node since Next 16, by convention still Edge-clean).                           |
   | `applyCsp` on every return      | Every middleware `return` is wrapped.                                                                                                                          |
   | CSP `script-src`                | No `'unsafe-inline'`; nonce/hash model intact.                                                                                                                 |
   | CSP `form-action`               | Includes the auth origin.                                                                                                                                      |
   | No secret defaults              | `process.env.X ?? 'default'` patterns for secrets — must throw when unset.                                                                                     |
   | `NEXT_PUBLIC_*`                 | No new runtime-varying value behind `NEXT_PUBLIC_`.                                                                                                            |
   | Shell commands                  | No request-derived value interpolated into a shell string; `execFileSync` with argv; allowlist resolution.                                                     |
   | Spawned `git` credentials       | Via env (`GIT_ASKPASS`, `GIT_SSH_COMMAND` + `0600` temp identity removed in `finally`), never argv or an embedded URL.                                         |
   | Service-to-service trust        | Reuses `apps/relay`'s signed HMAC token pattern; no new ad-hoc mechanism.                                                                                      |
   | better-auth `Origin`            | Server-to-server `fetch(SOVEREIGN_AUTH_URL…)` sends `Origin` = `SOVEREIGN_AUTH_URL`.                                                                           |
   | `session.freshAge: 0`           | Unchanged in `apps/auth/src/auth.ts` unless a re-auth flow ships with it.                                                                                      |
   | Session cookies                 | Profile/avatar self-mutations clear both `session_data` cookie variants.                                                                                       |
   | Invite-only                     | Registration enforcement reads the auth-server copy, never the platform DB.                                                                                    |
   | SDK boundary                    | Plugins import only `@sovereignfs/sdk`; `packages/sdk` imports no `db`/`mailer`.                                                                               |
   | SDK permission checks           | A missing plugin id fails closed; no `?? 'unknown'` fallback.                                                                                                  |
   | `getSurface()` is a hint        | Not used to gate authorization, entitlement, or data access.                                                                                                   |
   | Storage ownership               | Objects a job/schedule handler reads back are stored without `ownerUserId`, and the plugin has its own deletion path.                                          |
   | API namespace                   | New `runtime/app/api/*` segments update `RESERVED_API_SEGMENTS`.                                                                                               |
   | Overlay navigation              | Intra-overlay `<Link>` uses `replace`.                                                                                                                         |
   | Client globals                  | No browser globals in `useState` initializers or render.                                                                                                       |
   | Docker workspace                | Dockerfiles keep the `pnpm-workspace.yaml` COPY; plugin `manifest.json` + `migrations/` still ship to the runner.                                              |
   | Plugin tables                   | Slug-prefixed; user-scoped tables carry `tenant_id`.                                                                                                           |
   | Regex                           | No anchored quantifier before `$`/`^` on untrusted input.                                                                                                      |

4. **Report:**

   ```markdown
   ## Security Check Results

   **Files reviewed:** <sensitive files in diff>

   | Rule                            | Result  | Location |
   | ------------------------------- | ------- | -------- |
   | Server actions authorize inside | ✅ PASS | —        |
   | …                               |         |          |

   **Overall:** ✅ No violations found
   ```

   Only list rules relevant to the files in the diff; mark the rest "n/a".
   For each violation add a `Violations` section: file, line, risk, required
   fix. Distinguish confirmed violations from questions.

5. **On any violation, stop.** Do not proceed to the PR draft; fix, re-run
   `sv-verify`, and re-run this skill.

## Output rules

- Concise and actionable. Do not broaden into a general code review unless
  asked.
