import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '@sovereignfs/manifest';
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

  it('has a non-empty plugins array', () => {
    expect(Array.isArray(registry.plugins)).toBe(true);
    expect(registry.plugins.length).toBeGreaterThan(0);
  });

  it('every entry is a valid plugin manifest', () => {
    for (const entry of registry.plugins) {
      const result = validateManifest(entry);
      const id = (entry as { id?: string }).id ?? '<unknown>';
      expect(result.valid, `${id}: ${result.valid ? '' : result.errors.join('; ')}`).toBe(true);
    }
  });

  it('has no duplicate plugin ids', () => {
    const ids = registry.plugins.map((p) => (p as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the Console platform plugin as the seed entry', () => {
    const ids = registry.plugins.map((p) => (p as { id: string }).id);
    expect(ids).toContain('fs.sovereign.console');
  });
});
