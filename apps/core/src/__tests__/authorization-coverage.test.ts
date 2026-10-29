import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A server action and a route handler are public endpoints whatever the page around them checks, so
 * each one authorizes inside itself (docs/architecture-rules.md). This reads the app and fails when one
 * does not call `requireSession` or `requireCapability`, so a new one cannot be added without it.
 */
const APP = path.join(import.meta.dirname, '../../app');

/**
 * Routes that are public on purpose: better-auth's own (it checks sessions and tokens itself), a person's
 * picture (shown by apps with no credentials, read only), the two discovery documents (an app finds the
 * instance there with no account), and health.
 */
const PUBLIC_ROUTES = new Set([
  '.well-known/oauth-authorization-server/route.ts',
  '.well-known/openid-configuration/route.ts',
  'api/auth/[...all]/route.ts',
  'api/avatars/[userId]/route.ts',
  'api/health/route.ts',
]);

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const relative = (file: string) => path.relative(APP, file).split(path.sep).join('/');
const all = files(APP);
const authorizes = (source: string) => /\brequire(Session|Capability)\(/.test(source);

describe('server actions and route handlers authorize inside', () => {
  const routes = all.filter((file) => /(^|\/)route\.ts$/.test(relative(file)));
  const actions = all.filter(
    (file) =>
      /\.(ts|tsx)$/.test(file) && /^\s*['"]use server['"]/m.test(readFileSync(file, 'utf8')),
  );

  it('finds the routes there are, or this test would pass on nothing', () => {
    expect(routes.map(relative)).toEqual(expect.arrayContaining([...PUBLIC_ROUTES]));
  });

  it.each(
    routes
      .filter((file) => !PUBLIC_ROUTES.has(relative(file)))
      .map((file) => [relative(file), file]),
  )('route %s checks the session or a capability', (_name, file) => {
    expect(authorizes(readFileSync(String(file), 'utf8'))).toBe(true);
  });

  it.each(actions.map((file) => [relative(file), file]))(
    'server action file %s checks the session or a capability',
    (_name, file) => {
      expect(authorizes(readFileSync(String(file), 'utf8'))).toBe(true);
    },
  );

  it('keeps the public routes to the five that are public on purpose', () => {
    // Adding to the list is a decision to make in review, not a way to make this pass.
    expect([...PUBLIC_ROUTES].sort()).toEqual([
      '.well-known/oauth-authorization-server/route.ts',
      '.well-known/openid-configuration/route.ts',
      'api/auth/[...all]/route.ts',
      'api/avatars/[userId]/route.ts',
      'api/health/route.ts',
    ]);
  });

  it.each(
    routes
      .filter((file) => !relative(file).startsWith('api/auth/'))
      .filter((file) =>
        /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/.test(readFileSync(file, 'utf8')),
      )
      .map((file) => [relative(file), file]),
  )('route %s, which changes something, checks where the request came from', (_name, file) => {
    expect(/\brequireSameOrigin\(/.test(readFileSync(String(file), 'utf8'))).toBe(true);
  });

  it('recognises what it looks for', () => {
    expect(authorizes("await requireCapability('user:manage');")).toBe(true);
    expect(authorizes('const s = await requireSession();')).toBe(true);
    expect(authorizes('// requireSession is mentioned')).toBe(false);
    expect(authorizes('const session = await getSession();')).toBe(false);
  });
});

describe('every Console page checks for itself', () => {
  // A layout is not rendered again when someone moves between the pages beneath it, so the check made
  // there is not enough: each page asks `requireConsole` first (core-app §3.2.2).
  const consoleFiles = all.filter((file) => /^console\/.*(page|layout)\.tsx$/.test(relative(file)));

  it('finds the pages there are, or this test would pass on nothing', () => {
    expect(consoleFiles.map(relative)).toEqual(
      expect.arrayContaining(['console/layout.tsx', 'console/page.tsx']),
    );
  });

  it.each(consoleFiles.map((file) => [relative(file), file]))(
    '%s asks requireConsole before anything else',
    (_name, file) => {
      expect(/\brequireConsole\(/.test(readFileSync(String(file), 'utf8'))).toBe(true);
    },
  );
});
