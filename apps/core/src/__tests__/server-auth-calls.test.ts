import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// better-auth's hook applies the lock only to a browser's requests (core-app §3.5.1): core's own server code that calls better-auth with
// the request's headers must have read the session through `getSession`, which applies the lock, first. This lists every such file, in
// core and in the sign-in package core runs on, so a new one is looked at before it is added here.
const ROOT = path.join(import.meta.dirname, '../..');
const PACKAGE = path.join(ROOT, '../../packages/auth');
const KNOWN = [
  // The package's session read (`readSessionUnchecked`), under core's `getSession` and `getSessionEvenIfLocked`.
  'packages/auth/src/server/session.ts',
  // After `requireSignedIn`.
  'app/security/page.tsx',
  'app/security/passkeys/page.tsx',
  // For an actor from `requireCapability('client:manage')`, or the system actor.
  'src/clients/registry.ts',
  // The package's session list and ending (`listSessions`, `endSession`), from core's actions that call
  // `requireCapability('profile:manage')` first.
  'packages/auth/src/server/sessions.ts',
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
    const name = (file: string) =>
      file.startsWith(PACKAGE)
        ? `packages/auth/${path.relative(PACKAGE, file).split(path.sep).join('/')}`
        : path.relative(ROOT, file).split(path.sep).join('/');
    const found = [path.join(ROOT, 'app'), path.join(ROOT, 'src'), path.join(PACKAGE, 'src')]
      .flatMap((folder) => sources(folder))
      .filter((file) => CALL_WITH_HEADERS.test(readFileSync(file, 'utf8')))
      .map(name)
      .sort();
    expect(found).toEqual([...KNOWN].sort());
  });
});

// The package's unchecked session read skips core's lock; only the module that applies the lock may use it.
describe('the sign-in package’s unchecked session read', () => {
  it('is used by src/auth/session.ts alone', () => {
    const using = [path.join(ROOT, 'app'), path.join(ROOT, 'src'), path.join(ROOT, 'proxy.ts')]
      .flatMap((entry) => (entry.endsWith('.ts') ? [entry] : sources(entry)))
      .filter((file) => /\breadSessionUnchecked\b|\breadSession\b/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'));
    expect(using).toEqual(['src/auth/session.ts']);
  });
});
