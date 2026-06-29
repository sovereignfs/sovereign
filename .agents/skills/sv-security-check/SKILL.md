---
name: sv-security-check
description: Review a Sovereign branch diff for security-sensitive regressions. Use when changes touch auth, middleware, API routes, SDK surface, CSP, cookies, sessions, env secrets, plugin boundaries, or when the user asks for a security check before PR or merge.
---

# Sovereign Security Check

Perform a targeted security review against the current branch diff.

## When To Run

Run this skill when the diff touches any of:

- `apps/auth/`
- `runtime/src/middleware.ts` or `runtime/middleware.ts`
- `runtime/app/api/`
- `packages/sdk/`
- `packages/manifest/`
- Docker or env files
- files containing CSP, nonce, cookie, session, auth, secret, or middleware logic

## Workflow

1. Read the security conventions in:
   - `AGENTS.md`
   - `docs/architecture-rules.md`
   - `docs/multi-agent.md`

2. Determine diff scope:

   ```bash
   git diff main...HEAD --name-only
   ```

   If the branch base is not `main`, use the correct assigned base.

3. For each sensitive changed file, inspect the relevant diff:

   ```bash
   git diff main...HEAD -- <file>
   ```

4. Check these rules explicitly:

   | Rule                | What to verify                                                                  |
   | ------------------- | ------------------------------------------------------------------------------- |
   | SDK boundary        | Plugins do not import from `runtime/src`; use `@sovereignfs/sdk`.               |
   | SDK zero-deps       | `packages/sdk` does not import DB, mailer, or runtime implementations.          |
   | Async platform data | `getPlatformDb()`, `getConfig()`, and DB helpers are awaited.                   |
   | No secret defaults  | Secrets throw when unset; no insecure fallback literals.                        |
   | Runtime env values  | New runtime-varying config does not use `NEXT_PUBLIC_*`.                        |
   | Login redirect      | Middleware/login redirects use `303`, not `307`, for auth redirects.            |
   | Overlay navigation  | Intra-overlay `<Link>` usage includes `replace`.                                |
   | CSP script-src      | No `'unsafe-inline'`; nonce/hash model remains intact.                          |
   | CSP form-action     | Auth origin is included for logout POST redirects.                              |
   | Client globals      | Client components do not read browser globals during render or `useState` init. |
   | API namespace       | New `runtime/app/api/*` segments update reserved namespace checks.              |
   | Session cookies     | Profile/avatar self-mutations clear both session-data cookie variants.          |
   | Docker workspace    | Dockerfiles keep `pnpm-workspace.yaml` in build context.                        |
   | Plugin tables       | Plugin tables are slug-prefixed; user-scoped tables include `tenant_id`.        |
   | Fresh session age   | `apps/auth/src/auth.ts` keeps `session.freshAge: 0` unless re-auth exists.      |
   | Better-auth Origin  | Server-to-server better-auth POSTs send the expected `Origin` header.           |

5. Report results:

   ```markdown
   ## Security Check Results

   **Files reviewed:** <files>

   | Rule               | Result  | Location |
   | ------------------ | ------- | -------- |
   | Login redirect 303 | ✅ PASS | —        |
   | CSP script-src     | ✅ PASS | —        |

   **Overall:** ✅ No violations found
   ```

6. If violations are found, add a `Violations` section with file, line, risk,
   and required fix. Stop before PR draft until violations are fixed and
   verification is re-run.

## Output Rules

- Keep output concise and actionable.
- Distinguish confirmed violations from questions or assumptions.
- Do not broaden into a general code review unless the user asks.
