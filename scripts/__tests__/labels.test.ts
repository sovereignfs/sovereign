/**
 * The labels are a file, so that a repository's labels are what the repository says they are, and `skip-ci` (which the workflows read)
 * always exists. This holds the file to its own rules, to the labels the repository's bots and forms apply, and to the script that
 * applies it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { plan, type Label } from '../sync-labels';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const labels = JSON.parse(read('.github/labels.json')) as Label[];
const names = new Set(labels.map((label) => label.name.toLowerCase()));

describe('.github/labels.json', () => {
  it('names each label once, with a six-digit colour and a description GitHub accepts', () => {
    expect(names.size).toBe(labels.length);
    for (const label of labels) {
      expect(label.color, label.name).toMatch(/^[0-9a-fA-F]{6}$/);
      expect(label.description.length, label.name).toBeGreaterThan(0);
      expect(label.description.length, label.name).toBeLessThanOrEqual(100);
      expect(label.name.length, label.name).toBeLessThanOrEqual(50);
    }
  });

  it('has the label the workflows read to skip a run, and the ones GitHub starts a repository with', () => {
    for (const name of ['skip-ci', 'bug', 'documentation', 'enhancement', 'question']) {
      expect(names.has(name), name).toBe(true);
    }
    for (const file of ['ci.yml', 'codeql.yml']) {
      expect(read(`.github/workflows/${file}`)).toContain("'skip-ci'");
    }
  });

  it('has every label Dependabot and the issue forms apply, since GitHub drops one that does not exist', () => {
    const wanted: string[] = [];
    const dependabot = parse(read('.github/dependabot.yml')) as {
      updates: { labels?: string[] }[];
    };
    for (const update of dependabot.updates) wanted.push(...(update.labels ?? []));
    const forms = path.join(root, '.github/ISSUE_TEMPLATE');
    for (const file of readdirSync(forms).filter((f) => f !== 'config.yml')) {
      wanted.push(
        ...((parse(read(`.github/ISSUE_TEMPLATE/${file}`)) as { labels?: string[] }).labels ?? []),
      );
    }
    expect(wanted.length).toBeGreaterThan(0);
    for (const name of wanted) expect(names.has(name.toLowerCase()), name).toBe(true);
  });
});

describe('the label workflow', () => {
  const workflow = read('.github/workflows/labels.yml');

  it('may change labels and nothing else, and runs when the file does', () => {
    expect(workflow).toContain('issues: write');
    expect(workflow).not.toMatch(/(contents|pull-requests|actions|packages): write/);
    expect(workflow).toContain('.github/labels.json');
    expect(workflow).toContain('workflow_dispatch');
  });

  it('pins every action to a commit', () => {
    for (const line of workflow.split('\n').filter((l) => l.includes('uses:'))) {
      expect(line).toMatch(/@[0-9a-f]{40} # v/);
    }
  });
});

describe('plan', () => {
  const want: Label[] = [
    { name: 'bug', color: 'd73a4a', description: 'Broken' },
    { name: 'skip-ci', color: 'FBCA04', description: 'Skip CI' },
  ];

  it('makes what is missing, and changes what differs in colour, description or case of name', () => {
    expect(plan(want, [])).toEqual({ create: want, update: [], extra: [] });
    const found = plan(want, [
      { name: 'bug', color: 'D73A4A', description: 'Broken' },
      { name: 'Skip-CI', color: 'fbca04', description: 'Skip CI' },
    ]);
    expect(found.create).toEqual([]);
    expect(found.update.map((l) => l.name)).toEqual(['skip-ci']);
  });

  it('treats colours without regard to case or a leading #, and a missing description as empty', () => {
    expect(
      plan(
        [{ name: 'x', color: 'ABCDEF', description: '' }],
        [{ name: 'x', color: '#abcdef', description: null as unknown as string }],
      ),
    ).toEqual({ create: [], update: [], extra: [] });
  });

  it('reports a label it was not told about and leaves it', () => {
    expect(plan(want, [...want, { name: 'mine', color: '000000', description: '' }])).toEqual({
      create: [],
      update: [],
      extra: ['mine'],
    });
  });
});
