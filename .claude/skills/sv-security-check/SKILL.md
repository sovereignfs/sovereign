---
name: sv-security-check
description: Review a Sovereign branch diff for security-sensitive regressions against the hard architectural rules. Use when changes touch auth, the proxy, API routes, server actions, the OIDC provider, CSP, cookies, sessions, tokens, secrets, spawned processes, Docker/env files, or when the user asks for a security check before PR or merge.
---

# Sovereign Security Check

Targeted review of the current branch diff against the security-relevant hard
rules. Fast and scoped — runs after implementation, before the PR draft.

> **Shared skill.** This file is byte-identical in `.claude/skills/` (Claude
> Code) and `.agents/skills/` (Codex); a test enforces it.

## When to run

`sv-task-complete` triggers it when the diff touches any of:

- auth configuration, sign-in, sign-up, MFA, passkeys, sessions
- `apps/core/proxy.ts` — redirects, session verification, CSP, matcher
- `apps/core/app/api/` — API routes, the Core API, signed-download routes
- any `actions.ts` — server actions (public POST endpoints)
- the OIDC provider — clients, consent, scopes, claims, tokens
- `packages/config`, `packages/crypto`, `packages/database`
- `scripts/` — anything that spawns a process
- `Dockerfile*`, `docker-compose*.yml`, `.env.example`
- any file mentioning CSP, nonce, cookie, session, secret, token, credential

Run it manually any time with `sv-security-check`.

## Workflow

1. **Read the rules:** your instruction file's "Hard architectural rules"
   summary and, for anything unclear, `docs/architecture-rules.md` (the full
   detail, including the reason for each rule).

2. **Scope the diff:** `git diff main...HEAD --name-only` (use the assigned
   base if not `main`). For each sensitive file, read
   `git diff main...HEAD -- <file>`.

3. **Check these rules explicitly:**

   | Rule                            | What to verify in the diff                                                                                                                |
   | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
   | Server actions authorize inside | Every `'use server'` function requires a session; mutations also check the specific capability. Reads don't demand a mutation capability. |
   | Route handlers authorize inside | Every API route checks its own session, token scope or capability; nothing trusts a caller-supplied identity header.                      |
   | Owner and operator guarantees   | Owner-only capabilities stay ungrantable; only the owner acts on operators; no path leaves zero or two owners.                            |
   | OIDC                            | Exact redirect URI match; PKCE required for public clients; scopes limit claims; `roles` only to trusted clients; revocation honoured.    |
   | Timing-safe compare             | Any key/token compare uses `timingSafeEqual` on length-checked buffers, never `===`.                                                      |
   | Proxy redirect 303              | The redirect to sign-in is `303`, not `307`.                                                                                              |
   | Proxy matcher                   | A route that self-authorizes (signed token) is actually in the matcher's exclusion list; a doc comment is not proof.                      |
   | Edge discipline                 | `proxy.ts` gains no Node built-ins or DB access.                                                                                          |
   | CSP on every return             | Every proxy `return` applies the CSP.                                                                                                     |
   | CSP `script-src`                | No `'unsafe-inline'`; nonce/hash model intact.                                                                                            |
   | CSP `form-action`               | Includes every origin a form posts to or redirects through.                                                                               |
   | No secret defaults              | `process.env.X ?? 'default'` patterns for secrets — must throw when unset.                                                                |
   | `NEXT_PUBLIC_*`                 | No new runtime-varying value behind `NEXT_PUBLIC_`.                                                                                       |
   | Shell commands                  | No request-derived value interpolated into a shell string; `execFileSync` with argv; allowlist resolution.                                |
   | Spawned `git` credentials       | Via env (`GIT_ASKPASS`, `GIT_SSH_COMMAND` + `0600` temp identity removed in `finally`), never argv or an embedded URL.                    |
   | Service-to-service trust        | Reuses the one signed-token pattern; no new ad-hoc mechanism.                                                                             |
   | better-auth `Origin`            | Server-to-server calls to better-auth send `Origin` equal to its base URL.                                                                |
   | `session.freshAge: 0`           | Unchanged unless a re-authentication flow ships with it.                                                                                  |
   | Session cookies                 | Profile self-mutations clear both `session_data` cookie variants.                                                                         |
   | Stored secrets                  | Encrypted through `packages/crypto`; client secrets hashed; never logged or returned after creation.                                      |
   | Uploads                         | Type and size checked on the server; SVG sanitised; served with `nosniff`.                                                                |
   | Enumeration                     | Responses don't reveal whether an email address has an account (reset, directory beyond exact match).                                     |
   | Client globals                  | No browser globals in `useState` initializers or render.                                                                                  |
   | Docker workspace                | Dockerfiles keep the `pnpm-workspace.yaml` COPY; migrations ship in the image.                                                            |
   | Regex                           | No anchored quantifier before `$`/`^` on untrusted input.                                                                                 |

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
