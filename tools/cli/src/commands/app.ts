import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Refused } from '../errors.js';
import { askOrRefuse, confirm } from '../io.js';
import { appShow } from './remote.js';
import { refuseOverBudget } from './budget.js';
import { readManifest } from '../manifest.js';
import { SuiteFile, readLock, writeLock } from '../suite/files.js';
import { refreshedLock } from '../suite/lock.js';
import { RESERVED_APP_NAMES } from '../suite/names.js';
import { appEnvProblems } from '../suite/apps.js';
import {
  canPool,
  hasDatabase,
  isExternal,
  type App,
  type ExternalApp,
  type HostedApp,
  type Suite,
} from '../suite/types.js';
import type { Document } from 'yaml';

const NAME = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

function checkName(name: string, suite: Suite): void {
  if (!NAME.test(name)) {
    throw new Refused(
      `${name} is not a name an app can have.`,
      'Use 2 to 32 lower-case letters, digits and hyphens, starting with a letter and not ending with a hyphen.',
    );
  }
  if ((RESERVED_APP_NAMES as readonly string[]).includes(name)) {
    throw new Refused(
      `${name} is reserved.`,
      `Core, the proxy and the database use ${RESERVED_APP_NAMES.join(', ')}.`,
    );
  }
  if (suite.purge?.includes(name)) {
    throw new Refused(
      `${name} is waiting to have its data purged.`,
      'Deploy first, so the purge happens, then add it again.',
    );
  }
}

const KIND = {
  'add-hosted': { image: 'value', manifest: 'value', env: 'list', yes: 'switch' },
  'add-external': {
    external: 'switch',
    name: 'value',
    redirect: 'list',
    'post-logout': 'list',
    'back-channel': 'value',
    scope: 'list',
    public: 'switch',
    trusted: 'switch',
    yes: 'switch',
  },
} as const;

function envOf(items: string[] | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const item of items ?? []) {
    const equals = item.indexOf('=');
    if (equals < 1) throw new Refused(`${item} is not NAME=value.`);
    env[item.slice(0, equals)] = item.slice(equals + 1);
  }
  return env;
}

/** Writes `suite.yml` and a refreshed `suite.lock` together: the lock is resolved first, so a failed lookup writes nothing. */
export async function commit(
  ctx: Context,
  file: SuiteFile,
  change: (doc: Document) => void,
): Promise<Suite> {
  const next = file.preview(change);
  const lock = await refreshedLock(next, await readLock(ctx.root), (ref) =>
    ctx.registry.digest(ref),
  );
  await file.edit(change);
  await writeLock(ctx.root, lock);
  return next;
}

const setApp = (file: SuiteFile, name: string, app: App) => (doc: Document) => {
  file.appsMap();
  doc.setIn(['apps', name], doc.createNode(app));
};

async function add(ctx: Context, argv: string[]): Promise<void> {
  const external = argv.includes('--external');
  const args = parseArgs(argv, external ? KIND['add-external'] : KIND['add-hosted']);
  const [name] = positionals(
    args,
    1,
    'sv app add NAME --image REF   |   sv app add NAME --external --name N --redirect URL',
  );
  const file = await SuiteFile.load(ctx.root);
  const suite = file.value;
  checkName(name as string, suite);
  if (suite.apps && (name as string) in suite.apps) {
    throw new Refused(`${name} is already an app.`, 'Use sv app update to change it.');
  }

  if (external) {
    const display = args.values.get('name');
    const redirect = args.lists.get('redirect');
    if (!display || !redirect)
      throw new Refused('An external app needs --name and at least one --redirect.');
    const app: ExternalApp = {
      external: true,
      name: display,
      redirect,
      ...(args.lists.has('post-logout')
        ? { postLogout: args.lists.get('post-logout') as string[] }
        : {}),
      ...(args.values.has('back-channel')
        ? { backChannel: args.values.get('back-channel') as string }
        : {}),
      ...(args.lists.has('scope') ? { scopes: args.lists.get('scope') as string[] } : {}),
      ...(args.switches.has('public') ? { type: 'public' as const } : {}),
      ...(args.switches.has('trusted') ? { trusted: true } : {}),
    };
    await commit(ctx, file, setApp(file, name as string, app));
    ctx.io.err(`Added ${name} as an external app: it gets a sign-in and nothing else.`);
    ctx.io.err(
      'Its client ID and secret are made on the server when you deploy; sv app show NAME --secret then gives you the secret.',
    );
    return;
  }

  const image = args.values.get('image');
  if (!image)
    throw new Refused(
      'A hosted app needs --image REF, or --external for an app that runs elsewhere.',
    );
  const digest = await ctx.registry.digest(image);
  const app: HostedApp = {
    image,
    ...(args.values.has('manifest') ? { manifest: args.values.get('manifest') as string } : {}),
    ...(args.lists.has('env') ? { env: envOf(args.lists.get('env')) } : {}),
  };
  const manifest = await readManifest(
    name as string,
    app,
    ctx.registry,
    suite.core.version,
    ctx.fetch,
    digest,
  );
  const problems = appEnvProblems(name as string, app, manifest);
  if (problems.length > 0) {
    throw new Refused(
      `That cannot be set:\n${problems.map((p) => `  ${p.at}: ${p.message}`).join('\n')}`,
    );
  }
  ctx.io.err(`${manifest.name} (${name}) at https://${name}.${suite.domain}`);
  ctx.io.err(`  asks to sign people in with: ${manifest.signIn.scopes.join(', ')}`);
  if (manifest.signIn.scopes.includes('roles')) {
    ctx.io.err(
      '  It will be told whether each person is an admin or the owner, and it is trusted: people are not asked about it.',
    );
  }
  ctx.io.err(
    `  ${
      !hasDatabase(manifest)
        ? 'It needs no database.'
        : canPool(manifest)
          ? 'It gets its own database, and can work through a transaction pooler.'
          : 'It gets its own database, and needs a session, so it connects to the server itself.'
    }`,
  );
  await confirm(ctx.io, `Add ${name}?`, args.switches.has('yes'));
  await commit(ctx, file, setApp(file, name as string, app));
  ctx.io.err(`Added ${name}. Run sv push and sv deploy to start it.`);
}

const UPDATE = {
  image: 'value',
  manifest: 'value',
  env: 'list',
  'unset-env': 'list',
  name: 'value',
  redirect: 'list',
  'post-logout': 'list',
  'back-channel': 'value',
  scope: 'list',
  trusted: 'switch',
  untrusted: 'switch',
  description: 'value',
  icon: 'value',
  'launch-url': 'value',
  show: 'switch',
  hide: 'switch',
  yes: 'switch',
  connections: 'value',
} as const;

async function update(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, UPDATE);
  const [name] = positionals(args, 1, 'sv app update NAME [options]');
  const file = await SuiteFile.load(ctx.root);
  const suite = file.value;
  const current = suite.apps?.[name as string];
  if (!current)
    throw new Refused(`${name} is not an app in suite.yml.`, 'sv app list shows the apps.');
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(current)) as Record<
    string,
    unknown
  >;

  const only = (allowed: boolean, flag: string, kind: string) => {
    if (!allowed) throw new Refused(`--${flag} is for ${kind} apps, and ${name} is not one.`);
  };
  const ext = isExternal(current);
  const changed: string[] = [];
  for (const flag of ['image', 'manifest', 'env', 'unset-env', 'connections'] as const) {
    if (args.values.has(flag) || args.lists.has(flag)) only(!ext, flag, 'hosted');
  }
  for (const flag of ['name', 'redirect', 'post-logout', 'back-channel', 'scope'] as const) {
    if (args.values.has(flag) || args.lists.has(flag)) only(ext, flag, 'external');
  }
  if (args.switches.has('trusted') || args.switches.has('untrusted'))
    only(ext, 'trusted', 'external');

  if (args.values.has('image')) {
    next.image = args.values.get('image');
    changed.push('image');
  }
  if (args.values.has('manifest')) {
    next.manifest = args.values.get('manifest');
    changed.push('manifest');
  }
  if (args.values.has('connections')) {
    const value = args.values.get('connections') as string;
    if (value === 'default') Reflect.deleteProperty(next, 'connections');
    else if (/^[0-9]+$/.test(value) && Number(value) >= 2 && Number(value) <= 100)
      next.connections = Number(value);
    else throw new Refused('--connections takes a whole number from 2 to 100, or default.');
    changed.push('connections');
  }
  if (args.lists.has('env') || args.lists.has('unset-env')) {
    const env = {
      ...((next.env as Record<string, string> | undefined) ?? {}),
      ...envOf(args.lists.get('env')),
    };
    for (const variable of args.lists.get('unset-env') ?? []) Reflect.deleteProperty(env, variable);
    if (Object.keys(env).length > 0) next.env = env;
    else Reflect.deleteProperty(next, 'env');
    changed.push('env');
  }
  const setValue = (flag: string, key: string) => {
    const value = args.values.get(flag);
    if (value === undefined) return;
    next[key] = value;
    changed.push(flag);
  };
  const setList = (flag: string, key: string) => {
    const value = args.lists.get(flag);
    if (value === undefined) return;
    next[key] = value;
    changed.push(flag);
  };
  setValue('name', 'name');
  setList('redirect', 'redirect');
  setList('post-logout', 'postLogout');
  setValue('back-channel', 'backChannel');
  setList('scope', 'scopes');
  for (const [flag, trusted] of [
    ['trusted', true],
    ['untrusted', false],
  ] as const) {
    if (args.switches.has(flag)) {
      next.trusted = trusted;
      changed.push(flag);
    }
  }
  const launcher: Record<string, unknown> = {
    ...((next.launcher as Record<string, unknown> | undefined) ?? {}),
  };
  for (const [flag, key] of [
    ['description', 'description'],
    ['icon', 'icon'],
    ['launch-url', 'launchUrl'],
  ] as const) {
    const value = args.values.get(flag);
    if (value !== undefined) {
      launcher[key] = value;
      changed.push(flag);
    }
  }
  for (const [flag, show] of [
    ['show', true],
    ['hide', false],
  ] as const) {
    if (args.switches.has(flag)) {
      launcher.show = show;
      changed.push(flag);
    }
  }
  if (Object.keys(launcher).length > 0) next.launcher = launcher;
  if (changed.length === 0)
    throw new Refused('Nothing to change.', 'Pass the option to change, such as --image.');

  if (!ext) {
    const hosted = next as unknown as HostedApp;
    const digest = args.values.has('image') ? await ctx.registry.digest(hosted.image) : undefined;
    const manifest = await readManifest(
      name as string,
      hosted,
      ctx.registry,
      suite.core.version,
      ctx.fetch,
      digest,
    );
    const problems = appEnvProblems(name as string, hosted, manifest);
    if (problems.length > 0) {
      throw new Refused(
        `That cannot be set:\n${problems.map((p) => `  ${p.at}: ${p.message}`).join('\n')}`,
      );
    }
  }
  const change = setApp(file, name as string, next as unknown as App);
  // The limits must still fit: checked against the file as it would be, before anything is written.
  if (changed.includes('connections')) await refuseOverBudget(ctx, file.preview(change));
  await commit(ctx, file, change);
  ctx.io.err(`Changed ${name}: ${changed.join(', ')}. Run sv push and sv deploy to apply it.`);
}

async function remove(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { purge: 'switch', 'yes-delete-data': 'value' });
  const [name] = positionals(args, 1, 'sv app remove NAME [--purge]');
  const file = await SuiteFile.load(ctx.root);
  const suite = file.value;
  if (!suite.apps || !((name as string) in suite.apps)) {
    throw new Refused(`${name} is not an app in suite.yml.`, 'sv app list shows the apps.');
  }
  const purge = args.switches.has('purge');
  if (purge) {
    const typed =
      args.values.get('yes-delete-data') ??
      (ctx.io.interactive
        ? await askOrRefuse(
            ctx.io,
            `This deletes ${name}’s database, files and secrets for good. Type its name to confirm:`,
            '--yes-delete-data NAME',
          )
        : undefined);
    if (typed === undefined) {
      throw new Refused(
        '--purge deletes data, and there is no terminal to confirm in.',
        `Pass --yes-delete-data ${name}.`,
      );
    }
    if (typed !== name) throw new Refused('The name typed is not the app’s. Nothing was changed.');
  } else if (args.values.has('yes-delete-data')) {
    throw new Refused('--yes-delete-data goes with --purge.');
  }
  await commit(ctx, file, (doc) => {
    doc.deleteIn(['apps', name as string]);
    if (purge) {
      const purged = new Set(suite.purge ?? []);
      purged.add(name as string);
      doc.set('purge', doc.createNode([...purged]));
    }
    if (Object.keys((doc.toJS() as Suite).apps ?? {}).length === 0) doc.delete('apps');
  });
  ctx.io.err(
    purge
      ? `Removed ${name}, and recorded that its data goes at the next deployment.`
      : `Removed ${name}. Its data stays on the server; sv app remove ${name} --purge is what deletes it.`,
  );
}

async function list(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { json: 'switch' });
  positionals(args, 0, 'sv app list [--json]');
  const suite = (await SuiteFile.load(ctx.root)).value;
  const rows = Object.entries(suite.apps ?? {}).map(([name, app]) =>
    isExternal(app)
      ? { name, kind: 'external', displayName: app.name, redirect: app.redirect, address: null }
      : { name, kind: 'hosted', image: app.image, address: `https://${name}.${suite.domain}` },
  );
  if (args.switches.has('json')) {
    ctx.io.out(JSON.stringify({ apps: rows }, null, 2));
    return;
  }
  if (rows.length === 0) ctx.io.out('No apps. sv app add adds one.');
  for (const row of rows) {
    ctx.io.out(
      row.kind === 'hosted'
        ? `${row.name}\thosted\t${row.address}\t${row.image}`
        : `${row.name}\texternal\t${row.displayName}`,
    );
  }
}

/** `sv app ...` (operator-cli §4.2). These change files and nothing else; `show` needs the server and comes with deploying. */
export async function app(ctx: Context, argv: string[]): Promise<void> {
  const [verb, ...rest] = argv;
  switch (verb) {
    case 'add':
      return add(ctx, rest);
    case 'update':
      return update(ctx, rest);
    case 'remove':
      return remove(ctx, rest);
    case 'list':
      return list(ctx, rest);
    case 'show':
      return appShow(ctx, rest);
    default:
      throw new Refused('Usage: sv app add|update|remove|list|show');
  }
}
