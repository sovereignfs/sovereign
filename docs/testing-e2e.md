# End-to-end testing

Sovereign uses [Playwright](https://playwright.dev) for browser-driven end-to-end tests.
The suite covers the **golden paths** — the most critical user-facing flows — and runs against
the full stack (both apps booted by Playwright's `webServer` config).

## Running locally

```bash
# Install Playwright browsers (once — Chromium only by default in this project).
pnpm exec playwright install chromium

# Run all e2e tests (starts both apps if they're not already running).
pnpm test:e2e

# Keep your dev servers running across runs (faster):
pnpm dev &                           # in another terminal
pnpm test:e2e                        # reuses existing servers

# Headed mode (watch the browser):
pnpm test:e2e --headed

# Interactive UI mode (run/debug individual tests):
pnpm test:e2e --ui

# Debug a single test:
pnpm test:e2e --debug auth.spec.ts
```

**Refreshing stale auth state:** the global setup saves login storage state to `.auth/`. If you
change seed users or rotate secrets, delete the cache and re-run:

```bash
rm -rf .auth/
pnpm test:e2e
```

**Opening trace files:** when a test fails locally, Playwright writes a trace to `test-results/`.
Open it with:

```bash
pnpm exec playwright show-trace test-results/<test-name>/trace.zip
```

---

## CI

The `e2e.yml` workflow runs on every push to `main` that touches source code (`apps/**`,
`packages/**`, `plugins/**`, `runtime/**`, `scripts/**`, `bin/**`, `__tests__/e2e/**`,
`playwright.config.ts`, `package.json`, `pnpm-lock.yaml`). Docs-only merges do not trigger it.

**Required GitHub secrets:**

| Secret            | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `E2E_AUTH_SECRET` | HMAC signing secret for session cache (any base64 string) |
| `E2E_ADMIN_KEY`   | Sovereign admin key for admin API calls                   |

Generate them with `openssl rand -base64 32`.

On failure the HTML report is uploaded as a workflow artifact (`playwright-report`, 7-day
retention) — download and open `index.html` to view traces.

---

## What is covered

| Spec                 | Tests  | Description                                                      |
| -------------------- | ------ | ---------------------------------------------------------------- |
| `auth.spec.ts`       | 4      | Unauthenticated redirect, login, wrong password, logout          |
| `launcher.spec.ts`   | 3      | Plugin grid visible, tile click navigates, chrome plugins absent |
| `account.spec.ts`    | 3      | Profile page renders, display name update, theme toggle          |
| `console.spec.ts`    | 4      | Admin access, user 403, plugin list, user list                   |
| `navigation.spec.ts` | 3      | Root rewrite, brand link, avatar menu keyboard                   |
| `paywall.spec.ts`    | 3      | Paywalled redirect, tier display, token import + access          |
| **Total**            | **20** |                                                                  |

---

## What is NOT yet covered (deferred)

These flows were identified during planning but are not in the current golden-path suite.
They are candidates for future expansion:

| Flow                                        | Rationale for deferral                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TOTP / 2FA enrollment and challenge         | Requires OTP code generation in tests; adds test-tooling complexity                                               |
| Passkey (WebAuthn) registration & login     | Needs Playwright's experimental WebAuthn emulation (`page.context().addInitScript` + CTAP2 virtual authenticator) |
| Account — avatar upload                     | File upload + image serving; high value but needs `page.setInputFiles` + S3/local assertion                       |
| Account — password change                   | Low risk of regression; covered by unit tests on the auth route                                                   |
| Account — session list and revocation       | Multi-context session management; complex setup                                                                   |
| Account — data export / import              | ZIP download/upload; complex assertion                                                                            |
| Account — data consents                     | Requires two installed plugins with `sdk.data.provide`; setup-heavy                                               |
| Account — notifications tab                 | Depends on SSE stream delivery timing                                                                             |
| Account — push notifications                | Requires VAPID keys and service worker; browser permission                                                        |
| Account — billing / entitlements management | Covered by paywall spec; fine-grained CRUD deferred                                                               |
| Console — plugin enable/disable toggle      | State mutation that can break other tests; better as an isolated integration test                                 |
| Console — invite user (sends email)         | Requires Mailpit + mailbox assertion                                                                              |
| Console — broadcast notification            | Multi-user notification delivery; coordination overhead                                                           |
| Console — system health detail              | Covered by `/api/admin/health` unit tests                                                                         |
| Console — license key generation            | Covered by the paywall spec's global-setup; fine-grained UI deferred                                              |
| Activity log — event capture                | Correctness verified by unit tests; pagination and filter UI deferred                                             |
| Mobile viewport / responsive shell          | Playwright can emulate; deferred as separate mobile-viewport spec                                                 |
| Offline banner                              | Requires Playwright `page.context().setOffline(true)` emulation                                                   |
| Plugin compatibility badge                  | Requires installing a plugin with a mismatched `minPlatformVersion`                                               |
| Root plugin switching                       | Admin-only settings change with page-reload verification; deferred                                                |
| Cross-plugin data sharing                   | Requires two plugins with `sdk.data.provide/consume` registered                                                   |

---

## Adding new tests

1. Create `__tests__/e2e/<area>.spec.ts`.
2. Import from `./fixtures` for authenticated pages (`adminPage`, `userPage`), or from
   `@playwright/test` for unauthenticated tests.
3. Use ARIA selectors (`getByRole`, `getByLabel`, `aria-label=`) rather than CSS class names
   (Next.js scopes CSS Module names; they're stable in dev but shouldn't be relied on in tests).
4. Use `test.afterEach` / `page.request` for cleanup — do not leave mutated state that
   affects subsequent tests (especially for `workers: 1` serialised runs).
5. Run `pnpm test:e2e` locally before pushing.

The global setup (`global-setup.ts`) runs once per Playwright process. If your test requires
additional one-time setup (e.g. seeding a specific record), add it there and write the cleanup
in the spec's `test.afterEach`.
