import { readFileSync } from 'node:fs';
import { lte, satisfies } from 'semver';
import { describe, expect, it } from 'vitest';
import { RELEASE } from './release.js';

const read = (file: string) =>
  JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')) as { version: string };

describe('what this release of the toolkit says it supports', () => {
  it('names the version in package.json as its own', () => {
    expect(RELEASE.version).toBe(read('../package.json').version);
  });

  it('can deploy the core version it writes in sv setup, which is the one this repository is at', () => {
    expect(satisfies(RELEASE.newestCore, RELEASE.core)).toBe(true);
  });

  it('never writes a core version this repository has not reached', () => {
    const root = read('../../../package.json').version;
    expect(lte(RELEASE.newestCore, root)).toBe(true);
  });

  it('reads the schema and manifest versions the specifications are at', () => {
    expect(RELEASE.schemas).toEqual([1]);
    expect(RELEASE.manifests).toEqual([1]);
  });
});
