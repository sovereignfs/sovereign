import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAdminRateLimitForTests } from '../admin-rate-limit';

// vite/client's ImportMeta.glob typing isn't reachable from runtime's own
// tsconfig scope (vite is a transitive vitest dependency here, not a direct
// one) -- a minimal local declaration for the one overload this file uses,
// scoped to this test file only.
declare global {
  interface ImportMeta {
    glob<T = Record<string, unknown>>(pattern: string): Record<string, () => Promise<T>>;
  }
}

/**
 * Generic route-level coverage for every `runtime/app/api/admin/*` handler
 * (task 13.10, workstream 0020 leg 7). Closes the gap left by the `0.94.15`
 * authorization-bypass fix: `connections/route.ts` and `data-grants/route.ts`
 * shipped a real production bug (trusting a forgeable
 * `x-sovereign-user-role` header) that `checkAdminKey()` now closes, but
 * that fix is protected only by doc comments on those two files — nothing
 * fails if a future edit (a copy-pasted route missing the check, or the
 * guard reordered after a DB read) reintroduces the same class of bug on
 * any of the 36 files here. This test discovers every route module at
 * run time via `import.meta.glob`, so a route added after this task lands
 * is covered automatically with no test-file edit required.
 *
 * `@sovereignfs/db`/`@/src/db` are mocked so every export rejects with a
 * distinct sentinel if called — turns "guard reordered after a DB read"
 * into an immediate, clearly-attributed assertion failure instead of a
 * slow/hanging connection attempt against whatever DB_DIALECT happens to be
 * set in the test environment.
 */

vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mocked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    mocked[key] =
      typeof value === 'function'
        ? () => Promise.reject(new Error('TEST: DB touched before checkAdminKey'))
        : value;
  }
  return mocked;
});

vi.mock('../db', () => ({
  getPlatformDb: () => Promise.reject(new Error('TEST: DB touched before checkAdminKey')),
}));

// The one documented exception (email-templates/preview) authorizes via a
// real session cookie, not the admin key — mocked to "no session" here so
// its own dedicated test below doesn't fall through to a real fetch against
// SOVEREIGN_AUTH_URL inside verifySession.
vi.mock('../middleware/session', () => ({
  verifySession: async () => null,
}));

const PREVIEW_ROUTE_KEY = '../../app/api/admin/email-templates/preview/route.ts';

const routeModules = import.meta.glob<Record<string, unknown>>('../../app/api/admin/**/route.ts');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function paramsFor(key: string): { params: Promise<Record<string, string>> } {
  const segments: Record<string, string> = {};
  for (const match of key.matchAll(/\[(\w+)\]/g)) {
    segments[match[1] ?? ''] = 'test-id';
  }
  return { params: Promise.resolve(segments) };
}

function requestWithNoAuth(): Request {
  return new Request('http://localhost:3000/api/admin/test', {
    headers: { 'x-forwarded-for': '203.0.113.5' },
  });
}

interface DiscoveredHandler {
  key: string;
  method: (typeof HTTP_METHODS)[number];
  handler: (request: Request, context: unknown) => Promise<Response>;
}

async function discoverHandlers(): Promise<DiscoveredHandler[]> {
  const found: DiscoveredHandler[] = [];
  for (const [key, loader] of Object.entries(routeModules)) {
    if (key === PREVIEW_ROUTE_KEY) continue;
    const mod = await loader();
    for (const method of HTTP_METHODS) {
      const handler = mod[method];
      if (typeof handler === 'function') {
        found.push({ key, method, handler: handler as DiscoveredHandler['handler'] });
      }
    }
  }
  return found;
}

beforeEach(() => {
  process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
  resetAdminRateLimitForTests();
});

describe('admin route discovery', () => {
  it('finds exactly 36 route.ts files under runtime/app/api/admin', () => {
    expect(Object.keys(routeModules)).toHaveLength(36);
  });

  it('finds exactly 49 checkAdminKey-guarded handlers (50 total minus the 1 exempted preview route)', async () => {
    const handlers = await discoverHandlers();
    expect(handlers).toHaveLength(49);
  });
});

describe('checkAdminKey-guarded routes reject before touching the database', () => {
  it('every discovered handler returns 403 {error: "forbidden"} with no Authorization header', async () => {
    const handlers = await discoverHandlers();
    for (const { key, method, handler } of handlers) {
      resetAdminRateLimitForTests();
      const response = await handler(requestWithNoAuth(), paramsFor(key));
      expect(response.status, `${method} ${key} should 403`).toBe(403);
      const body: unknown = await response.json();
      expect(body, `${method} ${key} body`).toEqual({ error: 'forbidden' });
    }
  });

  it('every discovered handler returns 503 when SOVEREIGN_ADMIN_KEY is unconfigured', async () => {
    delete process.env.SOVEREIGN_ADMIN_KEY;
    const handlers = await discoverHandlers();
    for (const { key, method, handler } of handlers) {
      resetAdminRateLimitForTests();
      const response = await handler(requestWithNoAuth(), paramsFor(key));
      expect(response.status, `${method} ${key} should 503`).toBe(503);
    }
  });
});

describe('email-templates/preview — the one documented non-checkAdminKey exception', () => {
  it('GET returns 403 with no session (verifySession-gated, not the admin key)', async () => {
    const loader = routeModules[PREVIEW_ROUTE_KEY];
    if (!loader) throw new Error('preview route not found by glob');
    const mod = await loader();
    const GET = mod.GET as (request: Request) => Promise<Response>;
    const response = await GET(
      new Request('http://localhost:3000/api/admin/email-templates/preview'),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
  });
});
