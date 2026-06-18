# Adhoc Tasks & Bug Fixes

Unscheduled bugs, hotfixes, and operational issues that fall outside the main roadmap. Each entry includes the problem, root cause, and a clear fix path for Claude Code or other agents to pick up.

---

## Docker dev setup: auth server unreachable from browser

**Status:** Open\
**Severity:** High (blocks login in Docker Compose dev)\
**Discovered:** June 2026\
**Context:** Local development via `docker compose up --build`

### Symptom

When running `docker compose up --build` and opening the runtime in a browser, clicking "Sign in" redirects to `http://auth:3001/login`, which returns a connection error. The auth server is unreachable from the browser.

### Root Cause

The auth service in `docker-compose.yml` is intentionally configured as **internal-only**:

- It uses `expose: [3001]` (not `ports:`) — only accessible within the Docker bridge network
- The runtime container can reach it as `http://auth:3001` (Docker service discovery)
- The browser on the host machine cannot resolve the name `auth` or reach the internal Docker network

The runtime's login route (`runtime/app/login/route.ts` line 3–8) redirects directly to `SOVEREIGN_AUTH_URL` (set to `http://auth:3001` in the Compose file), assuming the browser can reach the auth server. This assumption breaks when auth is internal-only.

### Files Involved

- `docker-compose.yml` (lines 27–52) — auth service configuration
- `runtime/app/login/route.ts` (line 3–8) — login redirect logic
- `docker-compose.prod.yml` (auth service, lines 20–35) — production setup (for comparison)

### Solution Options

#### Option A: Expose auth port to host (simplest, dev-only)

Add a host port mapping to the auth service in `docker-compose.yml`.

**Files to modify:**

- `docker-compose.yml` line 38–39: change `expose: ['3001']` to `ports: ['3001:3001']`

**Tradeoff:** Auth is now publicly reachable on `localhost:3001` from the browser. Safe for dev but violates the design principle (internal-only). Do NOT apply this to `docker-compose.prod.yml`.

**Test:** `docker compose up --build`, open browser to `http://localhost:3000`, click Sign in, auth login form should appear, successful login should redirect back to runtime.

---

#### Option B: Route auth through runtime reverse proxy (correct architecture)

Proxy `/auth/*` requests from the browser through the runtime to the auth server. The runtime can reach auth internally; the browser reaches the auth UI via the runtime.

**Files to modify:**

- `runtime/app/login/route.ts` (line 8) — redirect to a local route instead of directly to auth (e.g., `${NEXT_PUBLIC_RUNTIME_URL}/api/auth-proxy/login`)
- `runtime/app/api/auth-proxy/[...path]/route.ts` (new file) — forward requests to `http://auth:3001` and return responses; preserve headers and body
- `docker-compose.yml` (optional line 46) — if using this approach, `AUTH_BASE_URL` should be set to the public runtime URL so better-auth constructs redirects that work in the browser

**Tradeoff:** More complex (proxy plumbing required). Correct architecture that mirrors the production setup (reverse proxy in front). No port exposure. Requires careful header/cookie handling in the proxy.

**Test:** Browser login redirects to `/api/auth-proxy/login`, which fetches from internal `http://auth:3001`. Auth form renders in browser. After submit, better-auth redirects through the proxy back to `/` successfully.

---

#### Option C: Use `docker compose --profile` to expose auth in dev only

Create an optional dev profile that exposes auth; production keeps it internal.

**Files to modify:**

- `docker-compose.yml` auth service (line 27–52): add `profiles: ['dev']` and change `expose: ['3001']` to `ports: ['3001:3001']`
- `docs/CONTRIBUTING.md` or similar — document that dev users must run `docker compose --profile dev up --build`

**Tradeoff:** Requires users to run with a flag. Simplest code change (no proxy logic) but adds operational complexity. Good interim solution while Option B is planned.

**Test:** `docker compose --profile dev up --build` exposes auth; login works. Default `docker compose up --build` (without profile) fails as before (correct behavior if planning Option B).

---

### Recommended Path

**Short term (unblock dev immediately):** Option A — expose auth port in `docker-compose.yml` only. Add a comment that this is dev-only and should never apply to production. This unblocks login in 2 minutes.

**Medium term (correct the architecture):** Option B — implement the proxy route in the runtime so the browser goes through the runtime to reach auth (mirrors how a production reverse proxy works). Remove the port exposure afterward. This is the right design.

**Alternative (if B is deferred):** Option C — use a profile flag so the port is only exposed when explicitly requested.

### Implementation Checklist

- [ ] Choose an option (A for quick unblock, B for correct design, C for interim)
- [ ] Modify the necessary files per the option
- [ ] Test login flow end-to-end: `docker compose up`, open `http://localhost:3000`, click Sign in, complete auth, session valid on runtime
- [ ] Verify no changes to production Compose files (`docker-compose.prod.yml` stays unchanged)
- [ ] Update `docs/CONTRIBUTING.md` if the dev setup changes
- [ ] Close this task once the fix is verified and documented

---

## Template for new adhoc tasks

Copy and expand this structure for new entries:

```markdown
## <Issue title>

**Status:** Open / In Progress / Done\
**Severity:** Low / Medium / High / Critical\
**Discovered:** <Date>\
**Context:** <Where/when discovered>

### Symptom

<What the user observes; include error messages or unexpected behavior>

### Root Cause

<Why it happens; include file:line references from the codebase>

### Files Involved

- `path/to/file.ts` (lines X–Y) — short description
- `path/to/file.yml` — short description

### Solution Options

#### Option A: <Short title>

<Description, tradeoffs, and design implications>

**Files to modify:**

- `file.ts` line X: change Y to Z

**Test:** <How to verify the fix works>

---

#### Option B: <Alternative approach>

...

### Recommended Path

<Which option to start with, why, and what comes next>

### Implementation Checklist

- [ ] Step 1
- [ ] Step 2
- [ ] Verify fix works
- [ ] Update docs if needed
- [ ] Close task
```
