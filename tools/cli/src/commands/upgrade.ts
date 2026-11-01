import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gt, valid } from 'semver';
import type { Document } from 'yaml';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Failed, Locked, Refused } from '../errors.js';
import { RELEASE } from '../release.js';
import { SuiteFile, readLock, writeLock } from '../suite/files.js';
import { refreshedLock } from '../suite/lock.js';
import { DEPLOY_WORKFLOW, pinnedWorkflowVersion, repinWorkflow } from '../suite/workflow.js';

const PACKAGE = '@sovereignfs/cli';

/**
 * How `suite.yml` is rewritten to the next `schema` (operator-cli §10.1), by the schema it starts at. There is one schema, so there
 * is nothing here yet; the first change to the format adds its migration to this table and a test that runs it, and every one after
 * that keeps the ones before, so a repository from any past release upgrades.
 */
export const MIGRATIONS: Record<number, { to: number; apply: (doc: Document) => string[] }> = {};

/** The version the repository pins the toolkit to, in `package.json`. */
async function pinnedVersion(root: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return pkg.dependencies?.[PACKAGE] ?? pkg.devDependencies?.[PACKAGE];
  } catch {
    return undefined;
  }
}

/** The newest release npm has. */
async function newest(ctx: Context): Promise<string> {
  try {
    const response = await ctx.fetch(`https://registry.npmjs.org/${PACKAGE.replace('/', '%2F')}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(15000),
    });
    const latest = ((await response.json()) as { 'dist-tags'?: { latest?: string } })['dist-tags']
      ?.latest;
    if (response.ok && latest && valid(latest)) return latest;
  } catch {
    // Fall through to the refusal.
  }
  throw new Refused(
    'Could not ask npm for the newest release of the toolkit.',
    'Pass --to vX.Y.Z, or --finish when you have already installed the version you want.',
  );
}

/**
 * `sv upgrade [--to vX.Y.Z] [--finish]` (operator-cli §10.1): moves the repository to a release of the toolkit and changes nothing else
 * of it that the release does not need. The toolkit that is installed can only describe itself, so it installs the one asked for and
 * hands the rest to it; `--finish` is that rest, and is what to run after a dependency bot has changed `package.json`.
 */
export async function upgrade(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { to: 'value', finish: 'switch' });
  positionals(args, 0, 'sv upgrade [--to vX.Y.Z] [--finish]');
  if (args.switches.has('finish')) return finish(ctx);

  const target = (args.values.get('to') ?? (await newest(ctx))).replace(/^v/, '');
  if (!valid(target) || target.includes('-')) {
    throw new Refused(`${target} is not a release version.`, 'Pass --to vX.Y.Z.');
  }
  if (target === RELEASE.version) return finish(ctx);
  if (args.values.has('to') === false && !gt(target, RELEASE.version)) {
    ctx.io.err(`The toolkit is at ${RELEASE.version}, which is the newest. Nothing to upgrade.`);
    return;
  }

  ctx.io.err(`Moving the toolkit from ${RELEASE.version} to ${target}.`);
  const installed = await ctx.exec(
    'npm',
    [
      'install',
      '--save-exact',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      `${PACKAGE}@${target}`,
    ],
    { cwd: ctx.root },
  );
  if (installed.code !== 0) {
    throw new Failed(
      `npm could not install ${PACKAGE}@${target}: ${installed.stderr.trim().split('\n').pop() ?? ''}`,
      'Check the version exists and your network, then run sv upgrade again.',
    );
  }
  const cli = path.join(ctx.root, 'node_modules', PACKAGE, 'dist', 'sv.mjs');
  if (!existsSync(cli)) throw new Failed(`${PACKAGE}@${target} installed without a toolkit in it.`);
  const next = await ctx.exec('node', [cli, 'upgrade', '--finish'], { cwd: ctx.root });
  if (next.stdout.trim()) ctx.io.out(next.stdout.trimEnd());
  if (next.stderr.trim()) ctx.io.err(next.stderr.trimEnd());
  if (next.code !== 0) {
    const Error_ = next.code === 2 ? Refused : next.code === 3 ? Locked : Failed;
    throw new Error_(
      `The upgrade did not finish: the toolkit is now ${target}, and suite.yml and suite.lock are as they were.`,
      'Fix what is said above, then run sv upgrade --finish.',
    );
  }
}

/** What the installed toolkit changes in the repository: the schema, core's version, and the lock (operator-cli §10.1, steps 3 to 5). */
async function finish(ctx: Context): Promise<void> {
  const pinned = await pinnedVersion(ctx.root);
  if (pinned !== RELEASE.version) {
    throw new Refused(
      `package.json pins the toolkit to ${pinned ?? 'nothing'} and this is ${RELEASE.version}.`,
      'Run ./sv after npm ci, so that the toolkit that runs is the one the repository pins.',
    );
  }
  const file = await SuiteFile.load(ctx.root);
  const before = file.value;
  const lock = await readLock(ctx.root);
  const newestSchema = Math.max(...RELEASE.schemas);
  if (before.schema > newestSchema) {
    throw new Refused(
      `suite.yml is schema ${before.schema}, and this toolkit reads up to ${newestSchema}.`,
      'Upgrade the toolkit; a newer file is never rewritten to an older one.',
    );
  }

  const changes: string[] = [];
  const change = (doc: Document, said: string[]) => {
    let schema: number = before.schema;
    while (schema < newestSchema) {
      const migration = MIGRATIONS[schema];
      if (!migration)
        throw new Refused(`There is no way to migrate suite.yml from schema ${schema}.`);
      said.push(...migration.apply(doc), `suite.yml: schema ${schema} → ${migration.to}`);
      schema = migration.to;
    }
    if (gt(RELEASE.newestCore, before.core.version)) {
      doc.setIn(['core', 'version'], RELEASE.newestCore);
      said.push(`core: ${before.core.version} → ${RELEASE.newestCore}`);
    }
  };
  const next = file.preview((doc) => change(doc, changes));
  const refreshed = await refreshedLock(next, lock, (ref) => ctx.registry.digest(ref));

  const was = lock?.images.cli.ref.split(':').pop();
  if (was !== RELEASE.version) changes.unshift(`toolkit: ${was ?? 'none'} → ${RELEASE.version}`);
  for (const key of ['cli', 'core', 'database', 'proxy', 'mail'] as const) {
    const old = lock?.images[key];
    const now = refreshed.images[key];
    if (old && now && (old.ref !== now.ref || old.digest !== now.digest)) {
      changes.push(`image ${key}: ${old.ref} → ${now.ref} (${now.digest.slice(0, 19)}…)`);
    } else if (!old && now) {
      changes.push(`image ${key}: added ${now.ref} (${now.digest.slice(0, 19)}…)`);
    } else if (old && !now) {
      changes.push(`image ${key}: removed ${old.ref}`);
    }
  }

  // The workflow that deploys from GitHub calls the toolkit's own at a version, and follows the toolkit.
  const workflowFile = path.join(ctx.root, DEPLOY_WORKFLOW);
  const workflowText = existsSync(workflowFile) ? await readFile(workflowFile, 'utf8') : undefined;
  const repinned =
    workflowText === undefined ? undefined : repinWorkflow(workflowText, RELEASE.version);
  if (workflowText !== undefined && repinned !== workflowText) {
    changes.push(
      `${DEPLOY_WORKFLOW}: calls the toolkit’s workflow at ${RELEASE.version}, not ${pinnedWorkflowVersion(workflowText)}`,
    );
  }

  if (changes.length === 0) {
    ctx.io.err(
      `Already at toolkit ${RELEASE.version}, core ${before.core.version}. Nothing to change.`,
    );
    return;
  }
  await file.edit((doc) => change(doc, []));
  if (workflowText !== undefined && repinned !== undefined && repinned !== workflowText)
    await writeFile(workflowFile, repinned);
  await writeLock(ctx.root, refreshed);
  ctx.io.err('Changed:');
  for (const line of changes) ctx.io.err(`  ${line}`);
  ctx.io.err(
    'App versions and database.version are not moved by an upgrade. Review it with git diff, then sv push and sv deploy.',
  );
}
