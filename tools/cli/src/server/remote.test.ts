import { describe, expect, it } from 'vitest';
import type { Suite } from '../suite/types.js';
import { shellWord, sshArgs, targetOf, tunnelArgs } from './remote.js';

const suite = (server: Record<string, unknown>) => ({ server }) as unknown as Suite;

describe('where sv connects', () => {
  it('is root unless suite.yml names another user, as contracts/suite.md says', () => {
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
    const args = tunnelArgs({ host: 'h.sovereign.local', user: 'ops', port: 2222 }, 8025, 8025);
    expect(args).toContain('-N');
    expect(args[args.indexOf('-L') + 1]).toBe('127.0.0.1:8025:127.0.0.1:8025');
    expect(args).toContain('ExitOnForwardFailure=yes');
    expect(args.slice(args.indexOf('--'))).toEqual(['--', 'ops@h.sovereign.local']);
    expect(args[args.indexOf('-p') + 1]).toBe('2222');
    expect(tunnelArgs({ host: 'h', user: 'root' }, 9000, 8025)).not.toContain('-p');
  });
});

describe('the words sent to the server', () => {
  it('go as they are when plain, so every command the toolkit sends is unchanged', () => {
    const args = sshArgs({ host: 'example.org', user: 'root' }, [
      '/usr/local/sbin/sovereign-receive',
      'restore',
      'a'.repeat(40),
      'app',
      'my-notes',
      '--secret',
    ]);
    expect(args.slice(args.indexOf('root@example.org') + 1)).toEqual([
      '/usr/local/sbin/sovereign-receive',
      'restore',
      'a'.repeat(40),
      'app',
      'my-notes',
      '--secret',
    ]);
  });

  it('are quoted for the server’s shell otherwise, so nothing in a word runs', () => {
    expect(shellWord('x; reboot')).toBe("'x; reboot'");
    expect(shellWord('$(id)')).toBe("'$(id)'");
    expect(shellWord('`id`')).toBe("'`id`'");
    expect(shellWord("it's")).toBe("'it'\\''s'");
    expect(shellWord('a\nb')).toBe("'a\nb'");
    expect(shellWord('')).toBe("''");
  });
});
