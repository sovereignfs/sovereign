import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashTree, parseArgs, provenanceMatches, type Provenance } from '../validate-registry';

describe('parseArgs', () => {
  it('defaults to write mode', () => {
    expect(parseArgs([])).toEqual({ check: false });
  });
  it('recognises --check', () => {
    expect(parseArgs(['--check'])).toEqual({ check: true });
  });
});

describe('provenanceMatches', () => {
  const base: Provenance = {
    commit: 'abc',
    contentHash: `sha256:${'a'.repeat(64)}`,
    validatedAt: '2026-06-16T00:00:00.000Z',
  };
  it('is false when committed is undefined', () => {
    expect(provenanceMatches(undefined, base)).toBe(false);
  });
  it('is true when commit + hash match (timestamp ignored)', () => {
    expect(provenanceMatches({ ...base, validatedAt: 'whenever' }, base)).toBe(true);
  });
  it('is false when the hash differs', () => {
    expect(provenanceMatches({ ...base, contentHash: `sha256:${'b'.repeat(64)}` }, base)).toBe(
      false,
    );
  });
  it('is false when the commit differs', () => {
    expect(provenanceMatches({ ...base, commit: 'def' }, base)).toBe(false);
  });
});

describe('hashTree', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hashtree-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('produces a sha256:<64 hex> digest', () => {
    writeFileSync(join(dir, 'a.txt'), 'hello');
    expect(hashTree(dir)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is deterministic for identical content', () => {
    writeFileSync(join(dir, 'a.txt'), 'hello');
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'b.txt'), 'world');

    const other = mkdtempSync(join(tmpdir(), 'hashtree-'));
    try {
      writeFileSync(join(other, 'a.txt'), 'hello');
      mkdirSync(join(other, 'sub'));
      writeFileSync(join(other, 'sub', 'b.txt'), 'world');
      expect(hashTree(dir)).toBe(hashTree(other));
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('changes when file content changes', () => {
    writeFileSync(join(dir, 'a.txt'), 'hello');
    const before = hashTree(dir);
    writeFileSync(join(dir, 'a.txt'), 'HELLO');
    expect(hashTree(dir)).not.toBe(before);
  });

  it('ignores the .git directory', () => {
    writeFileSync(join(dir, 'a.txt'), 'hello');
    const before = hashTree(dir);
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main');
    expect(hashTree(dir)).toBe(before);
  });
});
