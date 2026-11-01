/**
 * Makes a repository's labels match `.github/labels.json`: a missing label is made, and one whose colour or description differs is
 * changed. It never deletes, so a label someone made by hand is reported and left. Labels are matched by name without regard to case, as
 * GitHub does.
 *
 * It is run by `.github/workflows/labels.yml` under plain Node (type stripping), before any dependency is installed, so it must stay
 * self-contained: no imports of this repository's code, and only syntax that Node can strip.
 *
 *   GITHUB_TOKEN=$(gh auth token) node scripts/sync-labels.ts --repo OWNER/NAME [--dry-run] [--file labels.json]
 *
 * With no `--repo` it uses `GITHUB_REPOSITORY`, which Actions sets. The same file works for any repository: copy it, or point `--file` at
 * one, to give another repository of the organisation the same labels.
 */
import { readFileSync } from 'node:fs';

export type Label = { name: string; color: string; description: string };

export type Plan = {
  create: Label[];
  update: Label[];
  /** On the repository and not in the file: reported, never touched. */
  extra: string[];
};

const key = (name: string) => name.toLowerCase();
const colour = (value: string) => value.replace(/^#/, '').toLowerCase();

/** What has to change to make `existing` match `desired`. */
export function plan(desired: Label[], existing: Label[]): Plan {
  const have = new Map(existing.map((label) => [key(label.name), label]));
  const result: Plan = { create: [], update: [], extra: [] };
  for (const label of desired) {
    const found = have.get(key(label.name));
    if (!found) result.create.push(label);
    else if (
      colour(found.color) !== colour(label.color) ||
      (found.description ?? '') !== label.description ||
      // The name's case is part of what is wanted.
      found.name !== label.name
    ) {
      result.update.push(label);
    }
  }
  const wanted = new Set(desired.map((label) => key(label.name)));
  result.extra = existing.map((label) => label.name).filter((name) => !wanted.has(key(name)));
  return result;
}

type Api = (method: string, path: string, body?: unknown) => Promise<unknown>;

function api(token: string): Api {
  return async (method, path, body) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
    }
    return response.status === 204 ? undefined : response.json();
  };
}

async function existingLabels(call: Api, repo: string): Promise<Label[]> {
  const found: Label[] = [];
  for (let page = 1; ; page += 1) {
    const batch = (await call('GET', `/repos/${repo}/labels?per_page=100&page=${page}`)) as {
      name: string;
      color: string;
      description: string | null;
    }[];
    found.push(
      ...batch.map((l) => ({ name: l.name, color: l.color, description: l.description ?? '' })),
    );
    if (batch.length < 100) return found;
  }
}

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

if (import.meta.main) {
  const repo = option('repo') ?? process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const dryRun = process.argv.includes('--dry-run');
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.error('Name the repository: --repo OWNER/NAME (or set GITHUB_REPOSITORY).');
    process.exit(2);
  }
  if (!token) {
    console.error('Set GITHUB_TOKEN to a token that may change labels, such as $(gh auth token).');
    process.exit(2);
  }
  const desired = JSON.parse(
    readFileSync(option('file') ?? '.github/labels.json', 'utf8'),
  ) as Label[];
  const call = api(token);
  const changes = plan(desired, await existingLabels(call, repo));
  for (const label of changes.create) {
    console.log(`${dryRun ? 'would make' : 'make'} ${label.name}`);
    if (!dryRun) await call('POST', `/repos/${repo}/labels`, label);
  }
  for (const label of changes.update) {
    console.log(`${dryRun ? 'would change' : 'change'} ${label.name}`);
    if (!dryRun) {
      await call('PATCH', `/repos/${repo}/labels/${encodeURIComponent(label.name)}`, {
        new_name: label.name,
        color: colour(label.color),
        description: label.description,
      });
    }
  }
  for (const name of changes.extra) console.log(`left ${name}, which labels.json does not list`);
  if (changes.create.length + changes.update.length === 0) console.log(`${repo} already matches.`);
}
