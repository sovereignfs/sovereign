import { describe, expect, it } from 'vitest';
import type { Suite } from '../suite/types.js';
import { targetOf, tunnelArgs } from './remote.js';

const suite = (server: Record<string, unknown>) => ({ server }) as unknown as Suite;

describe('where sv connects', () => {
  it('is root unless suite.yml names another user, as spec/suite.md says', () => {
    expect(targetOf(suite({ host: '203.0.113.7' })).user).toBe('root');
    expect(targetOf(suite({ host: '203.0.113.7', user: 'ops', port: 2222 }))).toEqual({
      host: '203.0.113.7',
      port: 2222,
      user: 'ops',
    });
  });
});

describe('the tunnel to the server', () => {
  it('listens on this machine’s loopback address only, reaches the server’s loopback only, and runs no command', () => {
    const args = tunnelArgs({ host: 'h.example.com', user: 'ops', port: 2222 }, 8025, 8025);
    expect(args).toContain('-N');
    expect(args[args.indexOf('-L') + 1]).toBe('127.0.0.1:8025:127.0.0.1:8025');
    expect(args).toContain('ExitOnForwardFailure=yes');
    expect(args.slice(args.indexOf('--'))).toEqual(['--', 'ops@h.example.com']);
    expect(args[args.indexOf('-p') + 1]).toBe('2222');
    expect(tunnelArgs({ host: 'h', user: 'root' }, 9000, 8025)).not.toContain('-p');
  });
});
