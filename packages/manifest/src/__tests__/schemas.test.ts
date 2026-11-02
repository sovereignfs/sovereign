import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { schemas, supportedVersions, versionOf } from '../schemas';

const directory = fileURLToPath(new URL('../../../../contracts/schemas/', import.meta.url));

describe('the schemas', () => {
  it('are every manifest schema under contracts/schemas, so a new version cannot be left out', () => {
    const files = readdirSync(directory)
      .map((file) => /^app-manifest-v(\d+)\.schema\.json$/.exec(file)?.[1])
      .filter((version): version is string => version !== undefined)
      .map(Number)
      .sort();
    expect([...supportedVersions]).toEqual(files);
    expect(Object.keys(schemas).map(Number).sort()).toEqual(files);
  });

  it('each name the version it is for', () => {
    for (const version of supportedVersions) {
      expect((schemas[version].properties.manifest as { const: number }).const).toBe(version);
    }
  });

  it('say which version a document is, only if the package reads it', () => {
    expect(versionOf({ manifest: 1 })).toBe(1);
    expect(versionOf({ manifest: 2 })).toBe(2);
    for (const manifest of [0, 3, '2', null, undefined])
      expect(versionOf({ manifest })).toBe(undefined);
    expect(versionOf(null)).toBe(undefined);
  });
});
