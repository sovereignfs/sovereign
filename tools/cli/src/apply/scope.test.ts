import { describe, expect, it } from 'vitest';
import { Refused } from '../errors.js';
import {
  holds,
  isAppSecretFile,
  parseScopeWords,
  readManifest,
  scopeLabel,
  scopeOf,
  secretInScope,
} from './scope.js';

describe('an app’s secret files', () => {
  it('are its own, and never those of an app whose name begins with its name', () => {
    for (const file of [
      'app-notes-client-secret',
      'app-notes-postgres-url',
      'app-notes-postgres-direct-url',
      'app-notes-NOTES_SIGNING_KEY',
      'app-notes-op-NOTES_SMTP_PASSWORD',
      'role-app-notes-password',
    ])
      expect(isAppSecretFile('notes', file), file).toBe(true);
    for (const file of [
      'app-notes-extra-client-secret',
      'app-notes-extra-postgres-url',
      'app-notes-extra-EXTRA_KEY',
      'role-app-notes-extra-password',
      'SV_AUTH_SECRET',
    ])
      expect(isAppSecretFile('notes', file), file).toBe(false);
  });

  it('keep an app’s client secret when it is restored without core', () => {
    const notes = scopeOf({ apps: ['notes'] });
    expect(secretInScope(notes, 'app-notes-client-secret')).toBe(true);
    expect(secretInScope(notes, 'app-notes-client-secret', true)).toBe(false);
    expect(
      secretInScope(scopeOf({ core: true, apps: ['notes'] }), 'app-notes-client-secret', true),
    ).toBe(true);
  });
});

describe('a scope', () => {
  it('reads and names its parts, and knows what holds what', () => {
    const both = parseScopeWords(['core', 'app', 'tasks', 'app', 'notes']);
    expect(both).toEqual({ all: false, core: true, apps: ['notes', 'tasks'] });
    expect(scopeLabel(both as never)).toBe('core+app-notes+app-tasks');
    expect(holds({ all: true }, scopeOf({ core: true }))).toBe(true);
    expect(holds(scopeOf({ apps: ['notes'] }), scopeOf({ core: true }))).toBe(false);
    expect(holds(scopeOf({ apps: ['notes'] }), { all: true })).toBe(false);
  });

  it('refuses a backup.json it does not know, and an app name that is not one', () => {
    expect(() => readManifest('{"format":3}')).toThrow(/newer toolkit/);
    expect(() => readManifest('not json')).toThrow(Refused);
    expect(() =>
      readManifest('{"format":1,"scope":{"all":false,"core":false,"apps":["../x"]}}'),
    ).toThrow(Refused);
  });
});
