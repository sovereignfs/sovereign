import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import {
  EXPORT_FORMAT_VERSION,
  MAX_DECOMPRESSED_BYTES,
  assertSupportedFormat,
  buildZip,
  createRemapper,
  jsonToU8,
  readZip,
  sha256,
  u8ToJson,
} from '../bundle';

function getEntry(files: Record<string, Uint8Array | undefined>, key: string): Uint8Array {
  const v = files[key];
  expect(v, `expected "${key}" in bundle`).toBeDefined();
  return v as Uint8Array;
}

describe('bundle zip round-trip', () => {
  it('zips and unzips a flat file map losslessly', () => {
    const files = {
      'manifest.json': jsonToU8({ formatVersion: 1 }),
      'platform/account.json': jsonToU8({ profile: { name: 'A' } }),
      'plugins/x/blobs/pic.bin': new Uint8Array([1, 2, 3, 4, 255]),
    };
    const out = readZip(buildZip(files));
    expect(Object.keys(out).sort()).toEqual(Object.keys(files).sort());
    expect(u8ToJson<{ formatVersion: number }>(getEntry(out, 'manifest.json')).formatVersion).toBe(
      1,
    );
    expect([...getEntry(out, 'plugins/x/blobs/pic.bin')]).toEqual([1, 2, 3, 4, 255]);
  });
});

describe('readZip decompressed-size cap', () => {
  it('rejects a bundle whose declared uncompressed size exceeds the cap, without inflating it', () => {
    // A single highly-compressible entry that declares far more bytes than the
    // (test-scoped, small) cap allows — the filter must reject it before inflate,
    // based on the ZIP central directory's declared size alone.
    const bigFile = new Uint8Array(10_000_000); // compresses to a few KB
    const zip = zipSync({ 'plugins/x/blobs/huge.bin': bigFile }, { level: 6 });

    expect(() => readZip(zip, 1_000_000)).toThrow(/decompressed size limit/);
  });

  it('accepts a small bundle under the default cap', () => {
    const files = { 'manifest.json': jsonToU8({ formatVersion: 1 }) };
    const zip = buildZip(files);

    expect(() => readZip(zip)).not.toThrow();
    expect(MAX_DECOMPRESSED_BYTES).toBeGreaterThan(zip.byteLength);
  });

  it('sums declared sizes across entries toward the same cap', () => {
    const files = {
      a: new Uint8Array(600_000),
      b: new Uint8Array(600_000),
    };
    const zip = zipSync(files, { level: 6 });

    // Neither entry alone exceeds the cap, but their declared total does.
    expect(() => readZip(zip, 1_000_000)).toThrow(/decompressed size limit/);
  });
});

describe('sha256', () => {
  it('is stable and content-sensitive', () => {
    const a = jsonToU8({ k: 1 });
    expect(sha256(a)).toBe(sha256(jsonToU8({ k: 1 })));
    expect(sha256(a)).not.toBe(sha256(jsonToU8({ k: 2 })));
  });
});

describe('createRemapper', () => {
  it('maps a source id to a stable fresh id (referential integrity)', () => {
    const remap = createRemapper();
    const a1 = remap('a');
    const a2 = remap('a');
    const b = remap('b');
    expect(a1).toBe(a2); // same source → same new id
    expect(a1).not.toBe('a'); // freshly minted, not the original
    expect(a1).not.toBe(b); // distinct sources → distinct ids
  });
});

describe('assertSupportedFormat', () => {
  it('accepts the current format version', () => {
    expect(() => assertSupportedFormat(EXPORT_FORMAT_VERSION)).not.toThrow();
  });
  it('rejects a newer format version', () => {
    expect(() => assertSupportedFormat(EXPORT_FORMAT_VERSION + 1)).toThrow(/Unsupported/);
  });
  it('rejects an invalid version', () => {
    expect(() => assertSupportedFormat(0)).toThrow(/Invalid/);
  });
});
