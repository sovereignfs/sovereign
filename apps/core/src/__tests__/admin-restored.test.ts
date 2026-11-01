import { describe, expect, it, vi } from 'vitest';
import { parse, UsageError } from '../admin/args';
import { runAdmin, type InstanceOperations } from '../admin/run';
import { LedgerError } from '../accounts/deletion-ledger';

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
      restore
        ? {
            restore,
            exportDeletions: () => Promise.resolve(''),
            applyDeletions: () => Promise.reject(new Error('unused')),
            seed: () => Promise.reject(new Error('unused')),
          }
        : undefined,
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
    await expect(run()).rejects.toThrow('instance operations were not given');
  });
});

describe('sovereign-admin instance deletions', () => {
  it('reads export, and apply with or without a file', () => {
    expect(parse(['instance', 'deletions', 'export'])).toEqual({ name: 'deletions-export' });
    expect(parse(['instance', 'deletions', 'apply'])).toEqual({
      name: 'deletions-apply',
      file: undefined,
    });
    expect(parse(['instance', 'deletions', 'apply', '/tmp/d.json'])).toEqual({
      name: 'deletions-apply',
      file: '/tmp/d.json',
    });
  });

  it.each([
    [['instance', 'deletions'], 'deletions is export or apply'],
    [['instance', 'deletions', 'forget'], 'deletions is export or apply'],
    [['instance', 'deletions', 'export', 'x'], 'takes no argument'],
    [['instance', 'deletions', 'apply', 'a', 'b'], 'takes one FILE'],
    [['instance', 'deletions', 'export', '--json'], 'unknown option --json'],
  ])('refuses %j', (words, message) => {
    expect(() => parse(words)).toThrow(UsageError);
    expect(() => parse(words)).toThrow(message);
  });

  const operations = (extra: Partial<InstanceOperations> = {}): InstanceOperations => ({
    restore: () => Promise.reject(new Error('unused')),
    exportDeletions: () => Promise.resolve('{"version":1}'),
    applyDeletions: () =>
      Promise.resolve({ skipped: false, deletedAgain: 2, alreadyGone: 1, kept: 0, notices: 3 }),
    seed: () => Promise.reject(new Error('unused')),
    ...extra,
  });
  const run = async (argv: string[], instance: InstanceOperations | undefined) => {
    const out: string[] = [];
    const log: string[] = [];
    const code = await runAdmin(
      argv,
      {} as never,
      {} as never,
      { out: (line) => out.push(line), log: (line) => log.push(line) },
      instance,
    );
    return { code, out, log };
  };

  it('writes the export on standard output and nothing else there', async () => {
    const { code, out, log } = await run(['instance', 'deletions', 'export'], operations());
    expect(code).toBe(0);
    expect(out).toEqual(['{"version":1}']);
    expect(log).toEqual([]);
  });

  it('says what applying did, in the log, and gives the numbers as JSON', async () => {
    const apply = vi.fn(operations().applyDeletions);
    const { code, out, log } = await run(
      ['instance', 'deletions', 'apply', 'd.json'],
      operations({ applyDeletions: apply }),
    );
    expect(code).toBe(0);
    expect(apply).toHaveBeenCalledWith('d.json');
    expect(JSON.parse(out[0] as string)).toMatchObject({ deletedAgain: 2, notices: 3 });
    expect(log.join('\n')).toContain('2 accounts deleted again');
  });

  it('says so when the file was already applied', async () => {
    const { log } = await run(
      ['instance', 'deletions', 'apply'],
      operations({
        applyDeletions: () =>
          Promise.resolve({ skipped: true, deletedAgain: 0, alreadyGone: 0, kept: 0, notices: 0 }),
      }),
    );
    expect(log.join('\n')).toContain('already applied');
  });

  it('exits 1, saying what is wrong, for a file it cannot read', async () => {
    const { code, log } = await run(
      ['instance', 'deletions', 'apply'],
      operations({
        applyDeletions: () => Promise.reject(new LedgerError('The deletions are not JSON.')),
      }),
    );
    expect(code).toBe(1);
    expect(log.join('\n')).toContain('The deletions are not JSON.');
  });
});
