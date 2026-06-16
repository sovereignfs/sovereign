import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRegistryEntry } from '@sovereignfs/manifest';
import { describe, expect, it } from 'vitest';

// This test file lives in registry/__tests__/, so walk up one level to read
// registry/plugins.json regardless of the working directory.
const registryPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins.json');

interface Registry {
  registryVersion: number;
  plugins: unknown[];
}

const registry: Registry = JSON.parse(readFileSync(registryPath, 'utf8'));

describe('registry/plugins.json', () => {
  it('declares a registryVersion', () => {
    expect(registry.registryVersion).toBe(1);
  });

  it('has a plugins array (may be empty before any community submission)', () => {
    expect(Array.isArray(registry.plugins)).toBe(true);
  });

  // Entries are thin records — { id, repository, name, description, tags? } — not
  // full manifests; the manifest is fetched and validated from the source at
  // install time. The registry lists only third-party plugins; built-in platform
  // plugins ship in-repo and have no standalone source, so they never appear here.
  it('every entry is a valid registry entry', () => {
    for (const entry of registry.plugins) {
      const result = validateRegistryEntry(entry);
      const id = (entry as { id?: string }).id ?? '<unknown>';
      expect(result.valid, `${id}: ${result.valid ? '' : result.errors.join('; ')}`).toBe(true);
    }
  });

  it('has no duplicate plugin ids', () => {
    const ids = registry.plugins.map((p) => (p as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
