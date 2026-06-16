import { describe, expect, it } from 'vitest';
import { validateRegistryEntry } from '../validate';

const gitEntry = {
  id: 'io.example.tasks',
  repository: { type: 'git', url: 'https://github.com/you/sovereign-plugin-tasks' },
  name: 'Tasks',
  description: 'A simple task manager.',
  tags: ['productivity'],
};

const pathEntry = {
  id: 'io.example.local',
  repository: { type: 'path', url: './plugins/local' },
  name: 'Local',
  description: 'A first-party plugin referenced by path.',
};

describe('validateRegistryEntry', () => {
  it('accepts a git-source entry', () => {
    const res = validateRegistryEntry(gitEntry);
    expect(res.valid).toBe(true);
  });

  it('accepts a path-source entry (tags optional)', () => {
    const res = validateRegistryEntry(pathEntry);
    expect(res.valid).toBe(true);
  });

  it('rejects a git source whose url is not a valid URL', () => {
    const res = validateRegistryEntry({
      ...gitEntry,
      repository: { type: 'git', url: 'not-a-url' },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('repository');
    }
  });

  it('rejects an unknown source type', () => {
    const res = validateRegistryEntry({
      ...gitEntry,
      repository: { type: 'svn', url: 'https://example.com/repo' },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    const res = validateRegistryEntry({ ...gitEntry, manifest: { schemaVersion: 1 } });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('manifest');
    }
  });

  it('fails when a required field is missing', () => {
    const clone: Record<string, unknown> = { ...gitEntry };
    delete clone.description;
    const res = validateRegistryEntry(clone);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('description');
    }
  });
});
