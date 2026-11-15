/** The commands an app's repository runs through npm create @sovereignfs: release check and notes, commits check. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
      tags: { x: 'v1.2.0' },
      tag: 'v1.2.0',
      version: '1.2.0',
    });
    expect(readFileSync(output, 'utf8')).toBe(
      'release=true\ntags={"x":"v1.2.0"}\ntag=v1.2.0\nversion=1.2.0\n',
    );
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

describe('a repository of several components (sovereign.json)', () => {
  function repo() {
    const root = mkdtempSync(path.join(tmpdir(), 'sv-components-'));
    const write = (file: string, text: string) => {
      const target = path.join(root, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    };
    write(
      'sovereign.json',
      JSON.stringify({
        name: 'fjord',
        create: '0.14.0',
        components: [
          {
            name: 'cli',
            version: 'Cargo.toml',
            tagPrefix: 'fjord-cli-',
            changelog: 'crates/cli/CHANGELOG.md',
            publish: 'cli-release.yml',
          },
          {
            name: 'web',
            version: 'clients/web/package.json',
            tagPrefix: 'web-',
            changelog: 'clients/web/CHANGELOG.md',
            publish: 'web-release.yml',
          },
        ],
      }),
    );
    write('Cargo.toml', '[workspace]\nmembers = []\n\n[workspace.package]\nversion = "0.6.0"\n');
    write('crates/cli/CHANGELOG.md', '## [0.6.0] - 2026-11-15\n\n- CLI.\n');
    write('clients/web/package.json', JSON.stringify({ name: 'fjord-web', version: '0.5.0' }));
    write('clients/web/CHANGELOG.md', '## [0.5.0] - 2026-11-01\n\n- Web.\n');
    return root;
  }
  const tagged =
    (tags: string[]): Exec =>
    async (_c, args) => ({
      code: 0,
      stdout: args[0] === 'tag' && tags.includes(args[2] as string) ? `${args[2]}\n` : '',
      stderr: '',
    });

  it('releases the components a Release title names, each from its own version file, and hands each tag on', async () => {
    const root = repo();
    const output = path.join(root, 'gh-output');
    writeFileSync(output, '');
    const { ctx, out } = context(root, tagged(['web-v0.5.0']), { GITHUB_OUTPUT: output });
    expect(
      await runTool(
        ['release', 'check', '--title', 'Release fjord-cli-v0.6.0', '--github-output'],
        ctx,
      ),
    ).toBe(0);
    expect(JSON.parse(out[0] as string)).toEqual({
      release: true,
      tags: { cli: 'fjord-cli-v0.6.0' },
    });
    expect(readFileSync(output, 'utf8')).toContain(
      'tags={"cli":"fjord-cli-v0.6.0"}\ntag=fjord-cli-v0.6.0\n',
    );
  });

  it('accepts a title naming several, and refuses a Release of one already tagged', async () => {
    const root = repo();
    expect(
      await runTool(
        ['release', 'check', '--title', 'fjord-cli-v0.6.0, web-v0.5.0'],
        context(root, tagged([])).ctx,
      ),
    ).toBe(0);
    const refused = context(root, tagged(['web-v0.5.0']));
    expect(
      await runTool(
        ['release', 'check', '--title', 'Release fjord-cli-v0.6.0, web-v0.5.0'],
        refused.ctx,
      ),
    ).toBe(1);
    expect(refused.err.join('\n')).toContain('web-v0.5.0 is tagged already');
  });

  it('refuses a version a component is not at, and a tag no component has', async () => {
    const root = repo();
    const wrong = context(root, tagged([]));
    expect(await runTool(['release', 'check', '--title', 'web-v0.6.0, v1.0.0'], wrong.ctx)).toBe(1);
    expect(wrong.err.join('\n')).toContain('web is at 0.5.0, so it is web-v0.5.0');
    expect(wrong.err.join('\n')).toContain('"v1.0.0" is not the tag of a version here');
  });

  it('reads a component’s notes from its own changelog, by its tag', async () => {
    const root = repo();
    const { ctx, out } = context(root, tagged([]));
    expect(await runTool(['release', 'notes', 'fjord-cli-v0.6.0'], ctx)).toBe(0);
    expect(out).toEqual(['- CLI.']);
  });
});
