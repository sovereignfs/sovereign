import { describe, expect, it, vi } from 'vitest';
import { parse, UsageError } from '../admin/args';
import { runAdmin } from '../admin/run';

describe('sovereign-admin instance restored', () => {
  it('is read, with or without --json', () => {
    expect(parse(['instance', 'restored'])).toEqual({ name: 'restored', json: false });
    expect(parse(['instance', 'restored', '--json'])).toEqual({ name: 'restored', json: true });
  });

  it.each([
    [['instance'], 'a command is needed'],
    [['instance', 'forget'], 'unknown instance command forget'],
    [['instance', 'restored', 'now'], 'takes no argument'],
    [['instance', 'restored', '--at', 'x'], 'unknown option --at'],
  ])('refuses %j', (words, message) => {
    expect(() => parse(words)).toThrow(UsageError);
    expect(() => parse(words)).toThrow(message);
  });

  const run = async (restore?: () => Promise<{ at: number; moved: boolean }>, json = false) => {
    const out: string[] = [];
    const log: string[] = [];
    const code = await runAdmin(
      ['instance', 'restored', ...(json ? ['--json'] : [])],
      {} as never,
      {} as never,
      { out: (line) => out.push(line), log: (line) => log.push(line) },
      restore,
    );
    return { code, out, log };
  };

  it('records the restore, says when, and says what it ended', async () => {
    const restore = vi.fn(() => Promise.resolve({ at: Date.UTC(2026, 9, 31, 8, 0), moved: true }));
    const { code, out, log } = await run(restore);
    expect(code).toBe(0);
    expect(restore).toHaveBeenCalledOnce();
    expect(out).toEqual(['restored at: 2026-10-31T08:00:00.000Z']);
    expect(log.join('\n')).toContain('every session and token from before it is ended');
  });

  it('answers in JSON for a script, and says when it changed nothing', async () => {
    const { out, log } = await run(
      () => Promise.resolve({ at: Date.UTC(2026, 9, 31, 8, 0), moved: false }),
      true,
    );
    expect(JSON.parse(out[0] as string)).toEqual({
      restoredAt: '2026-10-31T08:00:00.000Z',
      moved: false,
    });
    expect(log.join('\n')).toContain('nothing changed');
  });

  it('is a bug, not a usage error, when the entry point gives it no way to record', async () => {
    await expect(run()).rejects.toThrow('restore marker was not given');
  });
});
