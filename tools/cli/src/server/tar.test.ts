import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Refused } from '../errors.js';
import { isKnownPath } from '../suite/files.js';
import { extract, makeArchive, readArchive } from './tar.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-tar-'));
  dirs.push(dir);
  return dir;
};
const any = () => true;

describe('reading an archive', () => {
  it('reads files, and writes them under the place it is given and nowhere else', async () => {
    const entries = readArchive(
      makeArchive({ 'suite.yml': 'a: 1\n', 'overrides/compose/core.yml': 'x\n' }),
      any,
    );
    expect(entries.map((e) => e.name)).toEqual(['suite.yml', 'overrides/compose/core.yml']);
    const dir = temp();
    await extract(entries, dir);
    expect(readFileSync(path.join(dir, 'overrides/compose/core.yml'), 'utf8')).toBe('x\n');
  });

  it('reads what git archive writes, including a long name and the commit header', () => {
    const repo = temp();
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: repo,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'T',
          GIT_AUTHOR_EMAIL: 't@sovereign.local',
          GIT_COMMITTER_NAME: 'T',
          GIT_COMMITTER_EMAIL: 't@sovereign.local',
        },
      });
    git('init', '--initial-branch=main');
    writeFileSync(path.join(repo, 'suite.yml'), 'a: 1\n');
    const deep = path.join(repo, 'overrides', 'compose', 'x'.repeat(60), 'y'.repeat(60));
    mkdirSync(deep, { recursive: true });
    writeFileSync(path.join(deep, 'core.yml'), 'long\n');
    git('add', '.');
    git('commit', '-m', 'x');
    const archive = git('archive', '--format=tar', 'HEAD', '--', 'suite.yml', 'overrides');
    const entries = readArchive(archive, isKnownPath);
    expect(entries.map((e) => e.name).sort()).toEqual([
      `overrides/compose/${'x'.repeat(60)}/${'y'.repeat(60)}/core.yml`,
      'suite.yml',
    ]);
    expect(entries.find((e) => e.name === 'suite.yml')?.data.toString()).toBe('a: 1\n');
  });

  it('refuses a name that climbs out, an absolute one, and a file that is not an instance file', () => {
    for (const name of ['../escape', '/etc/passwd', 'a/../../b', 'a//b']) {
      expect(() => readArchive(makeArchive({ [name]: 'x' }), any), name).toThrow(Refused);
    }
    expect(() => readArchive(makeArchive({ 'script.sh': 'x' }), isKnownPath)).toThrow(
      /not an instance file/,
    );
  });

  it('refuses a link, whole, before anything is read from it', () => {
    const archive = makeArchive({ 'suite.yml': 'x' });
    archive[156] = 0x32; // a symbolic link
    expect(() => readArchive(archive, any)).toThrow(/not a file/);
  });

  it('refuses an archive that is cut short or too large', () => {
    const archive = makeArchive({ 'suite.yml': 'x'.repeat(2000) });
    expect(() => readArchive(archive.subarray(0, 700), any)).toThrow(/ends before/);
    expect(() => readArchive(Buffer.alloc(33 * 1024 * 1024), any)).toThrow(/larger/);
  });
});
