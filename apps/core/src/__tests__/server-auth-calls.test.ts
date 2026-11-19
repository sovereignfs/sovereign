import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// better-auth's hook applies the lock only to a browser's requests (core-app §3.5.1): core's own server code that calls better-auth with
// the request's headers must have read the session through `getSession`, which applies the lock, first. This lists every such file, so
// a new one is looked at before it is added here.
const ROOT = path.join(import.meta.dirname, '../..');
const KNOWN = [
  // `getSessionEvenIfLocked` itself, under `getSession`.
  'src/auth/session.ts',
  // After `requireSignedIn`.
  'app/security/page.tsx',
  'app/security/passkeys/page.tsx',
  // For an actor from `requireCapability('client:manage')`, or the system actor.
  'src/clients/registry.ts',
  // From actions that call `requireCapability('profile:manage')` first.
  'src/sessions/sessions.ts',
];

const CALL_WITH_HEADERS = /\.api\.\w+\(\s*\{[^)]*?\bheaders\b/s;

function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = path.join(folder, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('core’s own calls to better-auth with the request’s headers', () => {
  it('are made only where the session was read through getSession first', () => {
    const found = ['app', 'src']
      .flatMap((folder) => sources(path.join(ROOT, folder)))
      .filter((file) => CALL_WITH_HEADERS.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
      .sort();
    expect(found).toEqual([...KNOWN].sort());
  });
});
