/**
 * `npm create @sovereignfs app settings apply|check` (research 0007): a repository's merge settings and rulesets are code, in
 * `.github/repository.json`. `apply`, run by an owner signed in with `gh`, makes GitHub match the file; `check` writes nothing and fails
 * when GitHub differs from it, in CI with the workflow's own token. Nothing is set in GitHub's interface and no token is stored.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CreateError, type Exec } from './create.js';
import type { RepositoryFile, Ruleset } from './settings-file.js';

type Rule = Ruleset['rules'][number];

/** What GitHub says, and what could not be read with the token in use. */
export type Live = {
  settings: Record<string, unknown>;
  rulesets: (Ruleset & { id: number })[];
  unreadable: string[];
};

export type Difference = { what: string; want: unknown; have: unknown };

const same = (a: unknown, b: unknown) =>
  JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** A rule's parameters as the file states them: GitHub answers with more (defaults the file does not manage), which are not compared. */
function ruleDifferences(name: string, want: Rule[], have: Rule[]): Difference[] {
  const out: Difference[] = [];
  const types = (rules: Rule[]) => rules.map((rule) => rule.type).sort();
  if (!same(types(want), types(have)))
    out.push({ what: `ruleset "${name}": rules`, want: types(want), have: types(have) });
  for (const rule of want) {
    const live = have.find((candidate) => candidate.type === rule.type);
    if (!live || !rule.parameters) continue;
    for (const [key, value] of Object.entries(rule.parameters)) {
      const current = live.parameters?.[key];
      const comparable =
        key === 'required_status_checks' && Array.isArray(value) && Array.isArray(current)
          ? [value, current].map((list) =>
              (list as { context: string }[]).map((check) => check.context).sort(),
            )
          : [value, current];
      if (!same(comparable[0], comparable[1])) {
        out.push({ what: `ruleset "${name}": ${rule.type}.${key}`, want: value, have: current });
      }
    }
  }
  return out;
}

/** Every way GitHub differs from the file, by what the file states. A ruleset GitHub has and the file does not is a difference too. */
export function differences(file: RepositoryFile, live: Live): Difference[] {
  const out: Difference[] = [];
  for (const [key, value] of Object.entries(file.settings)) {
    if (live.unreadable.includes(`settings.${key}`)) continue;
    if (!same(value, live.settings[key]))
      out.push({ what: `settings.${key}`, want: value, have: live.settings[key] });
  }
  if (live.unreadable.includes('rulesets')) return out;
  for (const ruleset of file.rulesets) {
    const current = live.rulesets.find((candidate) => candidate.name === ruleset.name);
    if (!current) {
      out.push({ what: `ruleset "${ruleset.name}"`, want: 'present', have: 'missing' });
      continue;
    }
    for (const key of ['target', 'enforcement', 'conditions', 'bypass_actors'] as const) {
      if (live.unreadable.includes(`ruleset "${ruleset.name}".${key}`)) continue;
      if (!same(ruleset[key], current[key])) {
        out.push({
          what: `ruleset "${ruleset.name}": ${key}`,
          want: ruleset[key],
          have: current[key],
        });
      }
    }
    out.push(...ruleDifferences(ruleset.name, ruleset.rules, current.rules));
  }
  for (const current of live.rulesets) {
    if (!file.rulesets.some((ruleset) => ruleset.name === current.name)) {
      out.push({ what: `ruleset "${current.name}"`, want: 'absent', have: 'present' });
    }
  }
  return out;
}

const gh = async (exec: Exec, cwd: string, args: string[]) => {
  const done = await exec('gh', args, { cwd });
  return { ...done, json: () => JSON.parse(done.stdout) as unknown };
};

/** Reads what GitHub has, noting what the token in use cannot read rather than taking it for a difference. */
export async function readLive(
  exec: Exec,
  cwd: string,
  repo: string,
  file: RepositoryFile,
): Promise<Live> {
  const unreadable: string[] = [];
  const repoAnswer = await gh(exec, cwd, ['api', `repos/${repo}`]);
  if (repoAnswer.code !== 0)
    throw new CreateError(`Reading ${repo} failed: ${repoAnswer.stderr.trim()}`, 1);
  const settings = repoAnswer.json() as Record<string, unknown>;
  // Some merge settings are given only to someone who may administer the repository.
  for (const key of Object.keys(file.settings))
    if (settings[key] === undefined) unreadable.push(`settings.${key}`);
  const rulesets: Live['rulesets'] = [];
  const list = await gh(exec, cwd, ['api', `repos/${repo}/rulesets`]);
  if (list.code !== 0) unreadable.push('rulesets');
  else {
    for (const { id } of list.json() as { id: number }[]) {
      const one = await gh(exec, cwd, ['api', `repos/${repo}/rulesets/${id}`]);
      if (one.code !== 0) {
        unreadable.push('rulesets');
        break;
      }
      const ruleset = one.json() as Ruleset & { id: number };
      // Who may bypass a ruleset is given only to someone who may administer the repository, too.
      if (ruleset.bypass_actors === undefined)
        unreadable.push(`ruleset "${ruleset.name}".bypass_actors`);
      rulesets.push(ruleset);
    }
  }
  return { settings, rulesets, unreadable };
}

export async function readRepositoryFile(file: string): Promise<RepositoryFile> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as RepositoryFile;
  } catch {
    throw new CreateError(`There is no readable ${file}.`, 1);
  }
}

/** Makes GitHub match the file: the settings, then each ruleset by name (made or replaced). One GitHub has and the file does not is removed only with `prune`. */
export async function apply(
  exec: Exec,
  cwd: string,
  repo: string,
  file: RepositoryFile,
  live: Live,
  prune: boolean,
): Promise<string[]> {
  const done: string[] = [];
  const work = await mkdtemp(path.join(tmpdir(), 'sv-settings-'));
  const send = async (method: string, endpoint: string, body: unknown) => {
    const input = path.join(work, 'body.json');
    await writeFile(input, JSON.stringify(body));
    const answer = await gh(exec, cwd, [
      'api',
      '-X',
      method,
      endpoint,
      '--input',
      input,
      '--silent',
    ]);
    if (answer.code !== 0)
      throw new CreateError(`${method} ${endpoint} failed: ${answer.stderr.trim()}`, 1);
  };
  const changed = Object.entries(file.settings).filter(
    ([key, value]) => !same(value, live.settings[key]),
  );
  if (changed.length > 0) {
    await send('PATCH', `repos/${repo}`, Object.fromEntries(changed));
    done.push(`settings: ${changed.map(([key]) => key).join(', ')}`);
  }
  for (const ruleset of file.rulesets) {
    const current = live.rulesets.find((candidate) => candidate.name === ruleset.name);
    if (!current) {
      await send('POST', `repos/${repo}/rulesets`, ruleset);
      done.push(`ruleset "${ruleset.name}": made`);
    } else if (
      differences(
        { settings: {}, rulesets: [ruleset] },
        { settings: {}, rulesets: [current], unreadable: [] },
      ).length > 0
    ) {
      await send('PUT', `repos/${repo}/rulesets/${current.id}`, ruleset);
      done.push(`ruleset "${ruleset.name}": replaced`);
    }
  }
  for (const current of live.rulesets) {
    if (file.rulesets.some((ruleset) => ruleset.name === current.name)) continue;
    if (!prune) {
      done.push(
        `ruleset "${current.name}": on GitHub but not in the file; kept (apply --prune removes it)`,
      );
      continue;
    }
    const answer = await gh(exec, cwd, [
      'api',
      '-X',
      'DELETE',
      `repos/${repo}/rulesets/${current.id}`,
      '--silent',
    ]);
    if (answer.code !== 0)
      throw new CreateError(
        `Removing ruleset "${current.name}" failed: ${answer.stderr.trim()}`,
        1,
      );
    done.push(`ruleset "${current.name}": removed`);
  }
  return done;
}
