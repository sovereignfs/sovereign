import { describe, expect, it } from 'vitest';
import { newestPublishedCore } from './core-version.js';
import { Failed } from './errors.js';
import { RELEASE } from './release.js';

const listing = (tags: string[] | Error) => ({
  tags: async () => {
    if (tags instanceof Error) throw tags;
    return tags;
  },
});

describe('the core a new instance starts on', () => {
  it('is the newest published release that the toolkit supports', async () => {
    const said: string[] = [];
    const tags = [
      '0.79.0',
      RELEASE.newestCore,
      '0.99.2',
      '0.99.10',
      '1.0.0',
      'latest',
      '0.100.0-rc.1',
    ];
    // 1.0.0 is outside the supported range, `latest` is no version, and a pre-release is not a release.
    expect(await newestPublishedCore(listing(tags), (m) => said.push(m))).toBe('0.99.10');
    expect(said).toEqual([]);
  });

  it('is never older than the core this toolkit was made for', async () => {
    expect(await newestPublishedCore(listing(['0.49.0', '0.60.0']), () => undefined)).toBe(
      RELEASE.newestCore,
    );
    expect(await newestPublishedCore(listing([]), () => undefined)).toBe(RELEASE.newestCore);
  });

  it('is the core this toolkit was made for, and says so, when the registry cannot be asked', async () => {
    const said: string[] = [];
    const failing = listing(new Failed('Could not reach ghcr.io: offline.'));
    expect(await newestPublishedCore(failing, (m) => said.push(m))).toBe(RELEASE.newestCore);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('Could not reach ghcr.io: offline');
    expect(said[0]).toContain(RELEASE.newestCore);
  });

  it('does not hide a mistake in the toolkit itself', async () => {
    await expect(
      newestPublishedCore(listing(new TypeError('bug')), () => undefined),
    ).rejects.toThrow('bug');
  });
});
