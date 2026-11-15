/** Repository settings as code: GitHub held to .github/repository.json, and made to match it by an owner's apply. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Exec } from './create.js';
import { apply, differences, readLive, type Live } from './settings.js';
import type { RepositoryFile } from './settings-file.js';

const file = JSON.parse(
  readFileSync(new URL('../template/app/_github/repository.json', import.meta.url), 'utf8'),
) as RepositoryFile;
const asLive = (overrides: Partial<Live> = {}): Live => ({
  settings: { ...file.settings },
  rulesets: file.rulesets.map((ruleset, i) => ({ ...structuredClone(ruleset), id: i + 1 })),
  unreadable: [],
  ...overrides,
});

describe('the differences', () => {
  it('are none when GitHub has what the file says, even with GitHub’s extra defaults', () => {
    const live = asLive();
    const pr = live.rulesets[0]?.rules.find((rule) => rule.type === 'pull_request');
    if (pr?.parameters) pr.parameters.require_extra_approval_for_unattributed_changes = true;
    expect(differences(file, live)).toEqual([]);
  });

  it('name a changed setting, a changed rule, a missing ruleset and an extra one', () => {
    const live = asLive({ settings: { ...file.settings, allow_squash_merge: true } });
    const pr = live.rulesets[0]?.rules.find((rule) => rule.type === 'pull_request');
    if (pr?.parameters) pr.parameters.allowed_merge_methods = ['merge', 'rebase'];
    live.rulesets.pop();
    live.rulesets.push({
      ...structuredClone(file.rulesets[1] as never),
      name: 'made in the interface',
      id: 9,
    });
    expect(differences(file, live).map((d) => d.what)).toEqual([
      'settings.allow_squash_merge',
      'ruleset "main is released through promotion pull requests": pull_request.allowed_merge_methods',
      'ruleset "develop is never deleted or rewritten"',
      'ruleset "made in the interface"',
    ]);
  });

  it('compare required checks as a set, and skip what the token cannot read', () => {
    const live = asLive({ unreadable: ['settings.allow_squash_merge', 'rulesets'] });
    live.settings.allow_squash_merge = undefined;
    live.rulesets = [];
    expect(differences(file, live)).toEqual([]);
  });
});

describe('reading GitHub', () => {
  it('notes a setting GitHub withholds from this token, rather than calling it a difference', async () => {
    const exec: Exec = async (_c, args) => {
      const endpoint = args[1] as string;
      if (endpoint === 'repos/o/r')
        return { code: 0, stdout: JSON.stringify({ default_branch: 'main' }), stderr: '' };
      return { code: 1, stdout: '', stderr: 'HTTP 403' };
    };
    const live = await readLive(exec, '.', 'o/r', file);
    expect(live.unreadable).toContain('settings.allow_merge_commit');
    expect(live.unreadable).toContain('rulesets');
    expect(live.unreadable).not.toContain('settings.default_branch');
  });
});

describe('apply', () => {
  const recording = () => {
    const calls: string[] = [];
    const exec: Exec = async (_c, args) => {
      calls.push(args.slice(0, 3).join(' '));
      return { code: 0, stdout: '', stderr: '' };
    };
    return { calls, exec };
  };

  it('changes nothing when GitHub already matches', async () => {
    const { calls, exec } = recording();
    expect(await apply(exec, '.', 'o/r', file, asLive(), false)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('patches the settings, replaces a changed ruleset, makes a missing one, and removes an extra only with prune', async () => {
    const live = asLive({ settings: { ...file.settings, allow_squash_merge: true } });
    const pr = live.rulesets[0]?.rules.find((rule) => rule.type === 'pull_request');
    if (pr?.parameters) pr.parameters.allowed_merge_methods = ['merge', 'rebase'];
    live.rulesets[1] = {
      ...structuredClone(file.rulesets[1] as never),
      name: 'made in the interface',
      id: 9,
    };
    const kept = recording();
    const said = await apply(kept.exec, '.', 'o/r', file, structuredClone(live), false);
    expect(kept.calls).toEqual(['api -X PATCH', 'api -X PUT', 'api -X POST']);
    expect(said.at(-1)).toContain('kept (apply --prune removes it)');
    const pruned = recording();
    await apply(pruned.exec, '.', 'o/r', file, structuredClone(live), true);
    expect(pruned.calls.at(-1)).toBe('api -X DELETE');
  });
});
