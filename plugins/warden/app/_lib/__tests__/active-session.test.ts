import { describe, expect, it } from 'vitest';
import { resolveActiveSessionId } from '../active-session';

/**
 * The server (loading a session's messages) and `WardenSidebar` (highlighting
 * a row) resolve "which session is open" independently now that the sidebar
 * renders from a layout, which receives no `searchParams`. Both call this,
 * so these cases lock in the one shared rule.
 */
describe('resolveActiveSessionId', () => {
  const ids = ['a', 'b', 'c']; // listSessions order: most recently active first

  it('uses the requested session when it exists', () => {
    expect(resolveActiveSessionId(ids, 'b', false)).toBe('b');
  });

  it('falls back to the most recently active session when none is requested', () => {
    expect(resolveActiveSessionId(ids, null, false)).toBe('a');
  });

  it('falls back rather than showing nothing for an unknown or foreign id', () => {
    expect(resolveActiveSessionId(ids, 'someone-elses-session', false)).toBe('a');
  });

  it('resolves to no session at all on /warden/new, even with a requested id', () => {
    expect(resolveActiveSessionId(ids, 'b', true)).toBeNull();
  });

  it('returns null when the user has no sessions yet', () => {
    expect(resolveActiveSessionId([], null, false)).toBeNull();
    expect(resolveActiveSessionId([], 'stale', false)).toBeNull();
  });
});
