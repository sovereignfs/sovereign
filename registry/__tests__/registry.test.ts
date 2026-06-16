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

  it('has a plugins array (may be empty before any community submission)', () => {
    expect(Array.isArray(registry.plugins)).toBe(true);
  });

  it('every entry is a valid plugin manifest', () => {
    for (const entry of registry.plugins) {
      const result = validateManifest(entry);
      const id = (entry as { id?: string }).id ?? '<unknown>';
      expect(result.valid, `${id}: ${result.valid ? '' : result.errors.join('; ')}`).toBe(true);
    }
  });

  it('lists only third-party plugins — built-in platform plugins are never registered', () => {
    for (const entry of registry.plugins) {
      const { id, type } = entry as { id?: string; type?: string };
      expect(['sovereign', 'community'], `${id ?? '<unknown>'} has type "${type}"`).toContain(type);
    }
  });

  it('has no duplicate plugin ids', () => {
    const ids = registry.plugins.map((p) => (p as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
