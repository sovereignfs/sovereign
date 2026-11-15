/** The commands an app's repository runs through npm create @sovereignfs: release check and notes, commits check. */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Exec } from './create.js';
import { optionsOf, runTool, type ToolContext } from './tools.js';

function app(version: string, changelog?: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sv-tools-'));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: '@sovereignfs/x', version }),
  );
  if (changelog !== undefined) writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
  return dir;
}

function context(cwd: string, exec: Exec, env: NodeJS.ProcessEnv = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const ctx: ToolContext = {
    io: {
      err: (l) => err.push(l),
      out: (l) => out.push(l),
      interactive: false,
      ask: async () => '',
    },
    exec,
    cwd,
    env,
  };
  return { ctx, out, err };
}

const noTags: Exec = async () => ({ code: 0, stdout: '', stderr: '' });

describe('release check', () => {
  it('passes a Release title for an untagged version with notes, and writes the plan for the workflow', async () => {
    const dir = app('1.2.0', '## [1.2.0] - 2026-11-15\n\n- A thing.\n');
    const output = path.join(dir, 'gh-output');
    writeFileSync(output, '');
    const { ctx, out } = context(dir, noTags, { GITHUB_OUTPUT: output });
    expect(
      await runTool(['release', 'check', '--title', 'Release v1.2.0', '--github-output'], ctx),
    ).toBe(0);
    expect(JSON.parse(out[0] as string)).toEqual({
      release: true,
      tag: 'v1.2.0',
      version: '1.2.0',
    });
    expect(readFileSync(output, 'utf8')).toBe('release=true\ntag=v1.2.0\nversion=1.2.0\n');
  });

  it('refuses a Release of a version already tagged, saying why', async () => {
    const dir = app('1.2.0', '## [1.2.0] - 2026-11-15\n\n- A thing.\n');
    const tagged: Exec = async () => ({ code: 0, stdout: 'v1.2.0\n', stderr: '' });
    const { ctx, err } = context(dir, tagged);
    expect(await runTool(['release', 'check', '--title', 'Release v1.2.0'], ctx)).toBe(1);
    expect(err.join('\n')).toContain('tagged already');
  });

  it('reads the title from PR_TITLE and the app from --dir, with a prefix', async () => {
    const dir = app('2.0.0');
    const { ctx } = context(path.dirname(dir), noTags, { PR_TITLE: 'web-v2.0.0' });
    expect(
      await runTool(['release', 'check', '--dir', path.basename(dir), '--prefix', 'web-'], ctx),
    ).toBe(0);
  });
});

describe('release notes', () => {
  it('prints the version’s section, from a version or its tag', async () => {
    const dir = app('1.2.0', '## [1.2.0] - 2026-11-15\n\n- A thing.\n');
    const { ctx, out } = context(dir, noTags);
    expect(await runTool(['release', 'notes', 'web-v1.2.0'], ctx)).toBe(0);
    expect(out).toEqual(['- A thing.']);
    expect(await runTool(['release', 'notes', '9.9.9'], context(dir, noTags).ctx)).toBe(1);
  });
});

describe('commits check', () => {
  it('refuses a trailer that names a model, and passes the agents’ own', async () => {
    const log =
      (message: string): Exec =>
      async () => ({ code: 0, stdout: `abc1234\x1f${message}\x1e`, stderr: '' });
    const bad = context('.', log('x\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n'));
    expect(await runTool(['commits', 'check', 'a..b'], bad.ctx)).toBe(1);
    expect(bad.err.join('\n')).toContain('abc1234');
    const good = context('.', log('x\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>\n'));
    expect(await runTool(['commits', 'check', 'a..b'], good.ctx)).toBe(0);
  });
});

describe('the options', () => {
  it('take --name value and --name=value, refuse an unknown one', () => {
    expect(optionsOf(['--title', 'a', '--dir=b', 'w'], ['title', 'dir']).values.get('dir')).toBe(
      'b',
    );
    expect(() => optionsOf(['--nope'], [])).toThrow('There is no option');
  });
});
