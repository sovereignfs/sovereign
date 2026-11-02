import { isMap, type Document } from 'yaml';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Refused } from '../errors.js';
import {
  DEFAULT_MAX_CONNECTIONS,
  DEFAULT_POOL,
  ROLE_HEADROOM,
  SUPERUSER_RESERVE,
  appPool,
  appRoleLimit,
  connectionBudget,
  corePool,
  maxConnectionsOf,
  poolerClients,
  poolerPool,
  roleLimit,
} from '../suite/connections.js';
import { SuiteFile } from '../suite/files.js';
import { isExternal } from '../suite/types.js';
import { commit } from './app.js';
import { appsWithDatabase, refuseOverBudget } from './budget.js';

/** `sv database` (operator-cli §4.1): the database server's settings and how its connections are shared out. Reads the files, not the server. */
async function show(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { json: 'switch' });
  positionals(
    args,
    0,
    'sv database [--json]  |  sv database set ...  |  sv database pooler enable|disable',
  );
  const suite = (await SuiteFile.load(ctx.root)).value;
  const { has, pooled, unread } = await appsWithDatabase(ctx, suite);
  const budget = connectionBudget(suite, has, pooled);
  const max = maxConnectionsOf(suite);
  const through = (name: string) => suite.database.pooler !== undefined && pooled(name);
  const hosted = Object.entries(suite.apps ?? {}).filter(([, app]) => !isExternal(app));
  const document = {
    postgres: suite.database.version,
    maxConnections: max,
    superuserReserve: SUPERUSER_RESERVE,
    roles: [
      { name: 'core', pool: corePool(suite), limit: roleLimit(corePool(suite)) },
      ...hosted
        .filter(([name]) => has(name))
        .map(([name]) => ({
          name,
          pool: appPool(suite, name),
          limit: appRoleLimit(suite, name, through(name)),
          pooled: through(name),
        })),
    ],
    pooler: suite.database.pooler
      ? {
          poolSize: poolerPool(suite),
          maxClients: poolerClients(suite),
          clients: budget.clients?.used ?? 0,
          apps: hosted.map(([name]) => name).filter((name) => has(name) && through(name)),
          direct: hosted.map(([name]) => name).filter((name) => has(name) && !through(name)),
        }
      : null,
    withoutDatabase: hosted.filter(([name]) => !has(name)).map(([name]) => name),
    used: budget.used,
    available: budget.available,
    left: budget.available - budget.used,
    unreadManifests: unread,
  };
  if (args.switches.has('json')) {
    ctx.io.out(JSON.stringify(document, null, 2));
    return;
  }
  const own = (name: string) => {
    const app = suite.apps?.[name];
    return app && !isExternal(app) && app.connections !== undefined ? ' (its own)' : '';
  };
  ctx.io.out(
    `PostgreSQL ${suite.database.version}, max_connections ${max}${max === DEFAULT_MAX_CONNECTIONS && suite.database.maxConnections === undefined ? ' (the default)' : ''}`,
  );
  for (const role of document.roles) {
    ctx.io.out(
      `  ${role.name.padEnd(14)} pool ${String(role.pool).padEnd(4)} role limit ${role.limit}${role.name === 'core' ? '' : own(role.name)}${'pooled' in role && role.pooled ? ' (through the pooler)' : ''}`,
    );
  }
  for (const name of document.withoutDatabase) ctx.io.out(`  ${name.padEnd(14)} has no database`);
  ctx.io.out(
    `${budget.used} of the ${budget.available} the server allows (${max} less ${SUPERUSER_RESERVE} kept for the superuser): ${
      budget.exceeded
        ? `over by ${budget.used - budget.available}`
        : `${budget.available - budget.used} left`
    }.`,
  );
  if (document.pooler) {
    const { poolSize, maxClients, clients, apps, direct } = document.pooler;
    ctx.io.out(
      `Pooler: on, ${poolSize} server connections for each app that goes through it, taking ${maxClients} clients (${clients} asked for). ${
        apps.length > 0 ? `Through it: ${apps.join(', ')}.` : 'No app goes through it.'
      }${direct.length > 0 ? ` Direct, since they do not declare transaction pooling or have none: ${direct.join(', ')}.` : ''}`,
    );
  } else ctx.io.out('Pooler: off (sv database pooler enable turns it on).');
  if (unread.length > 0)
    ctx.io.err(
      `Could not read the manifest of ${unread.join(', ')}, so ${unread.length === 1 ? 'it is' : 'they are'} counted as having a database and as not pooled.`,
    );
  if (budget.exceeded && !budget.explicit)
    ctx.io.err(
      'You have set nothing and the apps outgrew the defaults: sv deploy warns and carries on. sv database set lowers the pools or raises the server.',
    );
}

/** A number in range, `default` (which returns `null`, to remove the setting), or a refusal. */
function count(value: string, flag: string, min: number, max: number): number | null {
  if (value === 'default') return null;
  const n = Number(value);
  if (!/^[0-9]+$/.test(value) || n < min || n > max)
    throw new Refused(`--${flag} takes a whole number from ${min} to ${max}, or default.`);
  return n;
}

const setOrRemove = (doc: Document, path: string[], value: number | null | undefined) => {
  if (value === undefined) return;
  if (value === null) doc.deleteIn(path);
  else doc.setIn(path, value);
};

/** `sv database set` (operator-cli §4.1): changes the limits, checks they fit, and writes `suite.yml` and `suite.lock`. Nothing on the server. */
async function set(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { 'max-connections': 'value', core: 'value', app: 'value' });
  positionals(args, 0, 'sv database set [--max-connections N] [--core N] [--app N]');
  const wanted = {
    max: args.values.has('max-connections')
      ? count(args.values.get('max-connections') as string, 'max-connections', 20, 1000)
      : undefined,
    core: args.values.has('core')
      ? count(args.values.get('core') as string, 'core', 2, 100)
      : undefined,
    app: args.values.has('app')
      ? count(args.values.get('app') as string, 'app', 2, 100)
      : undefined,
  };
  if (wanted.max === undefined && wanted.core === undefined && wanted.app === undefined)
    throw new Refused(
      'Nothing to change.',
      'Pass --max-connections, --core or --app, each a number or default.',
    );
  const file = await SuiteFile.load(ctx.root);
  const before = file.value;
  const change = (doc: Document) => {
    setOrRemove(doc, ['database', 'maxConnections'], wanted.max);
    setOrRemove(doc, ['database', 'connections', 'core'], wanted.core);
    setOrRemove(doc, ['database', 'connections', 'app'], wanted.app);
    // A map with nothing in it is not left behind.
    const connections = doc.getIn(['database', 'connections'], true);
    if (isMap(connections) && connections.items.length === 0)
      doc.deleteIn(['database', 'connections']);
  };
  const next = file.preview(change);
  const { budget, unread } = await refuseOverBudget(ctx, next);
  await commit(ctx, file, change);
  if (unread.length > 0)
    ctx.io.err(
      `Could not read the manifest of ${unread.join(', ')}; counted as having a database.`,
    );
  ctx.io.err(
    `Set. ${budget.used} of ${budget.available} connections are shared out, ${budget.available - budget.used} left. Run sv push and sv deploy to apply it.`,
  );
  if (maxConnectionsOf(next) !== maxConnectionsOf(before))
    ctx.io.err(
      `max_connections goes from ${maxConnectionsOf(before)} to ${maxConnectionsOf(next)}: the database server restarts when this is deployed, and core and the apps reconnect.`,
    );
  if (
    next.database.connections?.app !== before.database.connections?.app ||
    next.database.connections?.core !== before.database.connections?.core
  )
    ctx.io.err(
      `A role may hold its pool plus ${ROLE_HEADROOM}. An app made before ${'`<PREFIX>_POSTGRES_POOL_MAX`'} existed keeps its own pool of ${DEFAULT_POOL}, and its role's limit is what holds it.`,
    );
}

/** `sv database pooler enable|disable` (operator-cli §4.2.2): writes `database.pooler` and the pooler's image in the lock. Nothing on the server. */
async function pooler(ctx: Context, argv: string[]): Promise<void> {
  const [verb, ...rest] = argv;
  const usage =
    'sv database pooler enable [--pool-size N] [--max-clients N]  |  sv database pooler disable';
  if (verb !== 'enable' && verb !== 'disable') throw new Refused(`Usage: ${usage}`);
  const args = parseArgs(
    rest,
    verb === 'enable' ? { 'pool-size': 'value', 'max-clients': 'value' } : {},
  );
  positionals(args, 0, usage);
  const file = await SuiteFile.load(ctx.root);
  const before = file.value.database.pooler;

  if (verb === 'disable') {
    if (before === undefined) {
      ctx.io.err('The pooler is already off. Nothing to change.');
      return;
    }
    await commit(ctx, file, (doc) => doc.deleteIn(['database', 'pooler']));
    ctx.io.err(
      'The pooler is off. Run sv push and sv deploy: every app goes back to the database server, and sv-pooler is removed. It kept no data.',
    );
    return;
  }

  const size = args.values.has('pool-size')
    ? count(args.values.get('pool-size') as string, 'pool-size', 2, 100)
    : undefined;
  const clients = args.values.has('max-clients')
    ? count(args.values.get('max-clients') as string, 'max-clients', 20, 5000)
    : undefined;
  if (before !== undefined && size === undefined && clients === undefined) {
    ctx.io.err(
      'The pooler is already on. Pass --pool-size or --max-clients to change it, or sv database to see it.',
    );
    return;
  }
  const change = (doc: Document) => {
    if (before === undefined) doc.setIn(['database', 'pooler'], doc.createNode({}));
    setOrRemove(doc, ['database', 'pooler', 'poolSize'], size);
    setOrRemove(doc, ['database', 'pooler', 'maxClients'], clients);
  };
  const next = file.preview(change);
  const { budget, pooled, unread } = await refuseOverBudget(ctx, next);
  try {
    await commit(ctx, file, change);
  } catch (error) {
    if (error instanceof Refused) throw error;
    throw new Refused(
      `The pooler's image could not be found: ${error instanceof Error ? error.message : String(error)}`,
      'This release of the toolkit publishes it at its own version: sv upgrade moves to the newest. Nothing was changed.',
    );
  }
  const hosted = Object.keys(next.apps ?? {}).filter((name) => pooled(name));
  ctx.io.err(
    `The pooler is on: ${poolerPool(next)} server connections for each app that goes through it, taking ${poolerClients(next)} clients. ${budget.used} of ${budget.available} connections are shared out.`,
  );
  ctx.io.err(
    hosted.length > 0
      ? `Through it: ${hosted.join(', ')}. Every other app, and core, connects to the database server itself, as before.`
      : 'No app goes through it yet: only an app whose manifest declares database.pooling: transaction does. Every app connects to the database server itself, as before.',
  );
  if (unread.length > 0)
    ctx.io.err(`Could not read the manifest of ${unread.join(', ')}; counted as not pooled.`);
  ctx.io.err('Run sv push and sv deploy to start it.');
}

export async function database(ctx: Context, argv: string[]): Promise<void> {
  const [verb, ...rest] = argv;
  if (verb === 'set') return set(ctx, rest);
  if (verb === 'pooler') return pooler(ctx, rest);
  return show(ctx, argv);
}
