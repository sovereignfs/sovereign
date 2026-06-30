# End-to-end tests

Browser-driven end-to-end tests for the full Sovereign stack. Playwright starts
the auth app and runtime from `playwright.config.ts` unless compatible dev
servers are already running.

## What lives here

- `*.spec.ts` files cover the current golden paths: auth, password reset,
  launcher, Account, Console, navigation, and paywall flows.
- `global-setup.ts` runs `pnpm sv seed`, signs in the seeded admin and user,
  saves storage state under `.auth/`, and prepares the paywall license token.
- `fixtures.ts` exposes authenticated `adminPage` and `userPage` fixtures.

Use direct `@playwright/test` imports for unauthenticated flows. Use
`./fixtures` when a test should begin with an authenticated browser context.

## Prerequisites

Install the Chromium browser once:

```bash
pnpm exec playwright install chromium
```

The suite expects the dev/test seed users created by `pnpm sv seed`; global
setup runs that command automatically. The seed is non-production-gated and
idempotent.

| Email                   | Password             | Role             |
| ----------------------- | -------------------- | ---------------- |
| `admin@sovereign.local` | `admin-dev-password` | `platform:owner` |
| `user@sovereign.local`  | `user-dev-password`  | `platform:user`  |

## Running

```bash
pnpm test:e2e
```

By default, Playwright starts:

- auth at `http://localhost:3001/login`
- runtime at `http://localhost:3000/api/health`

During local runs, existing servers are reused. In CI, fresh servers are started
and Chromium retries are enabled.

Playwright injects E2E-only local defaults for `AUTH_SECRET` and
`SOVEREIGN_ADMIN_KEY` when it starts both servers. To run with explicit values,
set `E2E_AUTH_SECRET` and `E2E_ADMIN_KEY`.

Useful variants:

```bash
pnpm test:e2e --headed
pnpm test:e2e --ui
pnpm test:e2e --debug auth.spec.ts
```

If seed users, auth secrets, or cookies change, refresh saved auth state:

```bash
rm -rf .auth/
pnpm test:e2e
```

Failed tests write traces to `test-results/`; open one with:

```bash
pnpm exec playwright show-trace test-results/<test-name>/trace.zip
```
