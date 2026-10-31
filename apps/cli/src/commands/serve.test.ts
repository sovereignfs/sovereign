import { describe, expect, it } from 'vitest';
import { Refused } from '../errors.js';
import { fakeIo } from '../testing/world.js';
import { receiveCommand } from './serve.js';
import type { ReceiverHost } from '../server/receive.js';

const host = {
  docker: async () => ({ code: 0, stdout: '', stderr: '' }),
  follow: async () => 0,
} as unknown as ReceiverHost;

describe('sv receive', () => {
  const { io } = fakeIo(false, { answers: [], hidden: [], stdin: '' });

  it('takes what follows -- as the request, whole, however it begins', async () => {
    const out: string[] = [];
    expect(
      await receiveCommand(io, ['--deploy-only', '--', 'version'], {
        host,
        write: (t) => void out.push(t),
      }),
    ).toBe(0);
    expect(out).toEqual(['1\n']);
    // A request that looks like an option is a request, and not understood, and does not change how the command runs.
    await expect(
      receiveCommand(io, ['--deploy-only', '--', '--deploy-only=no version'], {
        host,
        write: () => undefined,
      }),
    ).rejects.toBeInstanceOf(Refused);
  });

  it('needs exactly one request', async () => {
    for (const argv of [
      [],
      ['--'],
      ['version'],
      ['--', 'version', 'status'],
      ['--deploy-only', 'version', '--', 'status'],
    ]) {
      await expect(
        receiveCommand(io, argv, { host, write: () => undefined }),
        argv.join(' '),
      ).rejects.toBeInstanceOf(Refused);
    }
  });

  it('keeps the deployment key to deploying even when the request says otherwise', async () => {
    await expect(
      receiveCommand(io, ['--deploy-only', '--', 'status'], { host, write: () => undefined }),
    ).rejects.toThrow(/deploy and do nothing else/);
  });
});
