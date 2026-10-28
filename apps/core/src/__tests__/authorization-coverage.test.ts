import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A server action and a route handler are public endpoints whatever the page around them checks, so
 * each one authorizes inside itself (docs/architecture-rules.md). This reads the app and fails when one
 * does not call `requireSession` or `requireCapability`, so a new one cannot be added without it.
 */
const APP = path.join(import.meta.dirname, '../../app');

/** Routes that are public on purpose: better-auth's own (it checks sessions and tokens itself) and health. */
const PUBLIC_ROUTES = new Set(['api/auth/[...all]/route.ts', 'api/health/route.ts']);

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

  it('keeps the public routes to the two that are public on purpose', () => {
    // Adding to the list is a decision to make in review, not a way to make this pass.
    expect([...PUBLIC_ROUTES].sort()).toEqual([
      'api/auth/[...all]/route.ts',
      'api/health/route.ts',
    ]);
  });

  it('recognises what it looks for', () => {
    expect(authorizes("await requireCapability('user:manage');")).toBe(true);
    expect(authorizes('const s = await requireSession();')).toBe(true);
    expect(authorizes('// requireSession is mentioned')).toBe(false);
    expect(authorizes('const session = await getSession();')).toBe(false);
  });
});
