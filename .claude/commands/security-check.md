# Security Check

Targeted security review scoped to the current branch diff. Checks for violations of the hard architectural rules in CLAUDE.md and common security issues relevant to the changed files. Intended to be fast — runs after implementation, before PR draft.

## When to run

Automatically triggered by `/task-complete` when the diff touches any of:

- `apps/auth/` — auth server, session config, CSRF
- `runtime/src/middleware.ts` or `runtime/middleware.ts` — redirect codes, session verification
- `runtime/app/api/` — new API routes
- `packages/sdk/` — SDK surface changes
- Any file containing `csp`, `nonce`, `Content-Security-Policy`, `cookie`, `session`

Can also be run manually at any time: `/security-check`

## Steps

1. **Get the diff scope:**

   ```bash
   git diff main...HEAD --name-only
   ```

2. **Read the hard architectural rules** from `CLAUDE.md` — the section titled "Hard architectural rules — critical violations".

3. **For each changed file in the sensitive paths above**, read the relevant sections of the diff:

   ```bash
   git diff main...HEAD -- <file>
   ```

4. **Check for these violations specifically:**

   | Rule                                         | What to look for in the diff                                                                                        |
   | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
   | Middleware redirect must be 303              | Any `redirect(` or `NextResponse.redirect` — confirm status is 303, not 307                                         |
   | No `unsafe-inline` in script-src             | Any CSP header construction — confirm no `'unsafe-inline'`                                                          |
   | `applyCsp` on every middleware return        | Every `return` in middleware — confirm `applyCsp` wraps it                                                          |
   | `form-action` includes auth origin           | CSP `form-action` directive — confirm `SOVEREIGN_AUTH_PUBLIC_URL` is present                                        |
   | No secrets with defaults                     | `process.env.AUTH_SECRET \|\| 'default'` patterns — must throw, not default                                         |
   | No `NEXT_PUBLIC_*` for runtime values        | Any new `NEXT_PUBLIC_` env var — flag for review                                                                    |
   | `session.freshAge: 0` in auth.ts             | If `apps/auth/src/auth.ts` changed — confirm `freshAge` is still `0`                                                |
   | Server-to-server calls send `Origin`         | Any `fetch(SOVEREIGN_AUTH_URL` — confirm `Origin` header is set                                                     |
   | Profile mutations clear both cookie variants | Avatar/profile routes — confirm both `better-auth.session_data` and `__Secure-better-auth.session_data` are cleared |
   | `Link replace` for intra-overlay navigation  | Any `<Link` inside overlay/dialog components — confirm `replace` prop is present                                    |

5. **Report results:**

   ```
   ## Security Check Results

   **Files reviewed:** <list of sensitive files in diff>

   | Rule | Result | Location |
   |------|--------|----------|
   | Middleware redirect 303 | ✅ | — |
   | No unsafe-inline | ✅ | — |
   | applyCsp on all returns | ✅ | — |
   | ... | | |

   **Overall: ✅ No violations found** (or ❌ N violations — see below)
   ```

   For any violation, add a **Violations** section with file, line, and the specific issue.

6. **If violations are found** — stop and do not proceed to PR draft. Fix the violations first, then re-run `/verify` and `/security-check`.
