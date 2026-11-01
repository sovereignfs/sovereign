import { describe, expect, it } from 'vitest';
import { Refused } from './errors.js';
import { readManifest } from './manifest.js';
import { fakeRegistry, manifestOf } from './testing/world.js';

const IMAGE = 'ghcr.io/example/notes:1.2.0';
const read = (
  manifest: unknown,
  core = '0.71.0',
  app: { image: string; manifest?: string } = { image: IMAGE },
  fetchImpl?: typeof fetch,
) => readManifest('notes', app, fakeRegistry({ [IMAGE]: { manifest } }).registry, core, fetchImpl);

describe('reading an app’s manifest', () => {
  it('reads the label of the image, and returns the manifest', async () => {
    expect((await read(manifestOf())).prefix).toBe('NOTES');
  });

  it('refuses an image with no label, and says how to give one', async () => {
    const error = await readManifest(
      'notes',
      { image: IMAGE },
      fakeRegistry({ [IMAGE]: {} }).registry,
      '0.71.0',
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refused);
    expect((error as Refused).hint).toContain('--manifest');
  });

  it('prefers the address the operator gave over the label', async () => {
    const fetched: string[] = [];
    const fetchImpl = (async (url: string) => (
      fetched.push(url),
      new Response(JSON.stringify(manifestOf({ name: 'From the address' })))
    )) as unknown as typeof fetch;
    const manifest = await read(
      manifestOf({ name: 'From the label' }),
      '0.71.0',
      { image: IMAGE, manifest: 'https://sovereign.local/m.json' },
      fetchImpl,
    );
    expect(manifest.name).toBe('From the address');
    expect(fetched).toEqual(['https://sovereign.local/m.json']);
  });

  it('refuses an address that is not https', async () => {
    await expect(
      read(manifestOf(), '0.71.0', { image: IMAGE, manifest: 'http://sovereign.local/m.json' }),
    ).rejects.toThrow('must be https');
  });

  it.each([
    ['not json', 'nope', 'is not JSON'],
    [
      'a version it does not read',
      manifestOf({ manifest: 2 }),
      'version 2, which this toolkit does not read',
    ],
    ['an unknown field', manifestOf({ extra: true }), 'extra is not allowed'],
    [
      'no port',
      (() => {
        const m = manifestOf() as Record<string, unknown>;
        delete m.port;
        return m;
      })(),
      'port',
    ],
    ['the prefix SV', manifestOf({ prefix: 'SV' }), 'prefix'],
  ])('refuses a manifest with %s', async (_name, manifest, message) => {
    await expect(read(manifest)).rejects.toThrow(message);
  });

  it('refuses an app whose core range leaves out the instance’s, saying both', async () => {
    const error = await read(manifestOf({ core: '>=0.80.0' }), '0.71.0').catch((e: unknown) => e);
    expect((error as Refused).message).toContain('>=0.80.0');
    expect((error as Refused).message).toContain('0.71.0');
  });
});
