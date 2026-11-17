import { describe, expect, it } from 'vitest';
import { fakeHost } from '../testing/fake-host.js';
import { imageUser } from './files.js';

const CORE = `ghcr.io/sovereignfs/sovereign:0.108.0@sha256:${'d'.repeat(64)}`;

describe('imageUser', () => {
  it('pulls an image the server does not have yet, as a new core on an upgrade, then reads its user', async () => {
    const { host, docker } = fakeHost();
    docker.notPulled.add(CORE);
    docker.imageUsers[CORE] = '1001:1002';
    expect(await imageUser(host, CORE)).toBe('1001:1002');
    expect(docker.pulled).toEqual([CORE]);
  });

  it('does not pull an image the server already has', async () => {
    const { host, docker } = fakeHost();
    docker.imageUsers[CORE] = '1001';
    expect(await imageUser(host, CORE)).toBe('1001:1001');
    expect(docker.pulled).toEqual([]);
  });
});
