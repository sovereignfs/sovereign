import { describe, expect, it } from 'vitest';
import { validateRegistryEntry } from '../validate';

const gitEntry = {
  id: 'io.example.tasks',
  repository: { type: 'git', url: 'https://github.com/you/sovereign-plugin-tasks' },
  name: 'Tasks',
  description: 'A simple task manager.',
  author: { name: 'Ada Lovelace', email: 'ada@example.com', url: 'https://example.com' },
  homepage: 'https://example.com/tasks',
  license: 'MIT',
  keywords: ['productivity'],
};

const pathEntry = {
  id: 'io.example.local',
  repository: { type: 'path', url: './plugins/local' },
  name: 'Local',
  description: 'A first-party plugin referenced by path.',
  author: { name: 'Sovereign' },
  license: 'AGPL-3.0-or-later',
};

describe('validateRegistryEntry', () => {
  it('accepts a git-source entry with full metadata', () => {
    expect(validateRegistryEntry(gitEntry).valid).toBe(true);
  });

  it('accepts a path-source entry with minimal author (optional fields omitted)', () => {
    expect(validateRegistryEntry(pathEntry).valid).toBe(true);
  });

  it('accepts an optional pinned ref on a git source', () => {
    expect(
      validateRegistryEntry({ ...gitEntry, repository: { ...gitEntry.repository, ref: 'v1.2.0' } })
        .valid,
    ).toBe(true);
  });

  it('accepts a provenance block written by the validation script', () => {
    const res = validateRegistryEntry({
      ...gitEntry,
      provenance: {
        commit: '0123456789abcdef0123456789abcdef01234567',
        contentHash: `sha256:${'a'.repeat(64)}`,
        validatedAt: '2026-06-16T00:00:00.000Z',
      },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a malformed content hash', () => {
    const res = validateRegistryEntry({
      ...gitEntry,
      provenance: { commit: 'abc', contentHash: 'deadbeef', validatedAt: '2026-06-16' },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('contentHash');
  });

  it('rejects a git source whose url is not a valid URL', () => {
    const res = validateRegistryEntry({
      ...gitEntry,
      repository: { type: 'git', url: 'not-a-url' },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('repository');
  });

  it('rejects an unknown source type', () => {
    const res = validateRegistryEntry({
      ...gitEntry,
      repository: { type: 'svn', url: 'https://example.com/repo' },
    });
    expect(res.valid).toBe(false);
  });

  it('requires author', () => {
    const clone: Record<string, unknown> = { ...gitEntry };
    delete clone.author;
    const res = validateRegistryEntry(clone);
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('author');
  });

  it('requires license', () => {
    const clone: Record<string, unknown> = { ...gitEntry };
    delete clone.license;
    const res = validateRegistryEntry(clone);
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('license');
  });

  it('rejects unknown top-level keys (strict)', () => {
    const res = validateRegistryEntry({ ...gitEntry, manifest: { schemaVersion: 1 } });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('manifest');
  });
});
