import { byDigest } from '../apply/render.js';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Failed, Refused } from '../errors.js';
import { confirm } from '../io.js';
import { targetOf, type Target } from '../server/remote.js';
import { WRAPPER_PATH } from '../server/wrapper.js';
import { SuiteFile, readLock } from '../suite/files.js';
import { isExternal, type Suite } from '../suite/types.js';
import { publicNames } from '../apply/render.js';
import { remoteFailure } from './server.js';

/** Asks the server one thing and returns what it printed, or ends the command as the server’s answer says. */
async function ask(ctx: Context, target: Target, words: string[], what: string): Promise<string> {
  const result = await ctx.remote(target, [WRAPPER_PATH, ...words]);
  if (result.code !== 0) {
    if (result.code === 127 || /not found|No such file/.test(result.stderr)) {
      throw new Refused('The server has not been prepared.', 'Run sv server bootstrap.');
    }
    remoteFailure(result, what);
  }
  return result.stdout;
}

const json = <T>(text: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Failed(
      'The server answered in a way this toolkit cannot read.',
      'sv doctor checks the versions.',
    );
  }
};

type ServerState = {
  state: {
    commit: string;
    core: { version: string; healthy: boolean };
    apps: Record<string, { kind: string; healthy?: boolean; version?: string; clientId?: string }>;
  } | null;
  current: string | null;
  containers: { name: string; state: string; status: string }[];
  deploying: boolean;
};

async function localHead(ctx: Context): Promise<string | undefined> {
  const head = await ctx.exec('git', ['rev-parse', 'HEAD'], { cwd: ctx.root });
  return head.code === 0 ? head.stdout.trim() : undefined;
}

/** `sv status` (operator-cli §4.4): what is running, against what the repository says. */
export async function status(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { json: 'switch' });
  positionals(args, 0, 'sv status [--json]');
  const suite = (await SuiteFile.load(ctx.root)).value;
  const target = targetOf(suite);
  const server = json<ServerState>(await ask(ctx, target, ['status'], 'Asking for the status'));
  const head = await localHead(ctx);
  const apps = Object.entries(suite.apps ?? {}).map(([name, app]) => {
    const held = server.state?.apps[name];
    return {
      name,
      kind: isExternal(app) ? 'external' : 'hosted',
      onServer: held !== undefined,
      healthy: held?.healthy ?? null,
      version: held?.version ?? null,
    };
  });
  const extra = Object.keys(server.state?.apps ?? {}).filter(
    (name) => !(name in (suite.apps ?? {})),
  );
  const document = {
    host: target.host,
    deployed: server.state?.commit ?? null,
    head: head ?? null,
    upToDate: head !== undefined && server.state?.commit === head,
    deploying: server.deploying,
    core: {
      wanted: suite.core.version,
      running: server.state?.core.version ?? null,
      healthy: server.state?.core.healthy ?? null,
    },
    apps,
    notInSuite: extra,
    containers: server.containers,
  };
  if (args.switches.has('json')) {
    ctx.io.out(JSON.stringify(document, null, 2));
    return;
  }
  const short = (hash: string | null) => (hash ? hash.slice(0, 12) : 'nothing');
  ctx.io.out(`Server ${target.host}${server.deploying ? ' (a deployment is running)' : ''}`);
  if (!server.state) {
    ctx.io.out('Nothing has been deployed yet. sv deploy puts the repository on it.');
    return;
  }
  ctx.io.out(
    document.upToDate
      ? `Running ${short(document.deployed)}, which is the repository’s latest commit.`
      : `Running ${short(document.deployed)}; the repository is at ${short(document.head)}. sv push and sv deploy bring it up to date.`,
  );
  ctx.io.out(
    `Core ${document.core.running}${document.core.running !== document.core.wanted ? ` (suite.yml wants ${document.core.wanted})` : ''}: ${document.core.healthy ? 'healthy' : 'not healthy'}`,
  );
  for (const app of apps) {
    ctx.io.out(
      !app.onServer
        ? `${app.name}: not deployed yet`
        : app.kind === 'external'
          ? `${app.name}: external, signs in through core`
          : `${app.name}: ${app.healthy ? 'healthy' : 'not healthy'}${app.version ? `, ${app.version}` : ''}`,
    );
  }
  for (const name of extra)
    ctx.io.out(`${name}: on the server and not in suite.yml (the next deployment stops it)`);
}

/** `sv logs [NAME]` (operator-cli §4.4): core, the proxy, the database, an app, or the last deployment (the default). */
export async function logs(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { lines: 'value' });
  const [name = 'deploy'] = args.positionals.length
    ? positionals(args, 1, 'sv logs [NAME] [--lines N]')
    : [];
  const lines = args.values.get('lines') ?? '200';
  if (!/^[0-9]{1,5}$/.test(lines)) throw new Refused('--lines takes a number.');
  const suite = (await SuiteFile.load(ctx.root)).value;
  const text = await ask(ctx, targetOf(suite), ['logs', name, lines], 'Reading the logs');
  ctx.io.out(text.replace(/\n$/, ''));
}

type Check = { name: string; status: 'ok' | 'warn' | 'fail'; detail: string; fix?: string };

const atLeast = (version: string | undefined, major: number, minor: number) => {
  const [a = 0, b = 0] = (version ?? '').replace(/^v/, '').split('.').map(Number);
  return a > major || (a === major && b >= minor);
};

/** The names the proxy answers to, from suite.yml alone. */
const namesOf = (suite: Suite) => {
  const names = publicNames(suite);
  return [names.core, ...Object.values(names.apps)];
};

/** `sv doctor` (operator-cli §4.1): checks DNS, ports, the toolkit and the server’s Docker, and says what to fix. It changes nothing. */
export async function doctor(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { json: 'switch' });
  positionals(args, 0, 'sv doctor [--json]');
  const suite = (await SuiteFile.load(ctx.root)).value;
  const lock = await readLock(ctx.root);
  const target = targetOf(suite);
  const checks: Check[] = [];

  const reached = await ctx.remote(target, [WRAPPER_PATH, 'doctor']);
  if (reached.code !== 0) {
    checks.push({
      name: 'The server',
      status: 'fail',
      detail:
        reached.code === 255
          ? `ssh to ${target.user}@${target.host} did not work: ${reached.stderr.trim().split('\n').pop() ?? ''}`
          : 'ssh works but the server has not been prepared.',
      fix:
        reached.code === 255
          ? 'Check server.host, server.port and server.user in suite.yml, and that ssh to it works.'
          : 'Run sv server bootstrap.',
    });
  } else {
    const server = json<{
      protocol: number;
      docker: { engine?: string; compose?: string };
      freeBytes: number | null;
      toolkitImage: string | null;
    }>(reached.stdout);
    checks.push({
      name: 'The server',
      status: 'ok',
      detail: `reached over ssh; toolkit protocol ${server.protocol}`,
    });
    checks.push(
      atLeast(server.docker.engine, 24, 0) && atLeast(server.docker.compose, 2, 20)
        ? {
            name: 'Docker',
            status: 'ok',
            detail: `engine ${server.docker.engine}, Compose ${server.docker.compose}`,
          }
        : {
            name: 'Docker',
            status: 'fail',
            detail: `engine ${server.docker.engine ?? 'none'}, Compose ${server.docker.compose ?? 'none'}`,
            fix: 'Docker 24 or newer with Compose 2.20 or newer is needed. sv server bootstrap installs it on Debian and Ubuntu.',
          },
    );
    const free = server.freeBytes;
    checks.push(
      free !== null && free < 1024 ** 3
        ? {
            name: 'Disk',
            status: 'fail',
            detail: `${(free / 1024 ** 2).toFixed(0)} MB free`,
            fix: 'A deployment needs 1 GB free under /var/lib/sovereign.',
          }
        : {
            name: 'Disk',
            status: 'ok',
            detail: free === null ? 'not prepared yet' : `${(free / 1024 ** 3).toFixed(1)} GB free`,
          },
    );
    if (lock && server.toolkitImage && server.toolkitImage !== byDigest(lock.images.cli)) {
      checks.push({
        name: 'The toolkit on the server',
        status: 'warn',
        detail: 'it runs a different release from the one this repository pins',
        fix: 'The next sv deploy brings the server to the pinned toolkit.',
      });
    }
  }

  const addresses = /^[0-9.]+$|:/.test(target.host)
    ? [target.host]
    : await ctx.network.resolve(target.host);
  const strict = (suite.tls?.mode ?? 'per-host') === 'per-host';
  for (const name of namesOf(suite)) {
    const resolved = await ctx.network.resolve(name);
    const ok = resolved.length > 0 && resolved.some((address) => addresses.includes(address));
    checks.push(
      ok
        ? { name: `DNS for ${name}`, status: 'ok', detail: resolved.join(', ') }
        : {
            name: `DNS for ${name}`,
            status: strict ? 'fail' : 'warn',
            detail: resolved.length
              ? `resolves to ${resolved.join(', ')}, not ${addresses.join(', ')}`
              : 'does not resolve',
            fix: `Point ${name} at ${addresses.join(', ') || target.host}.${strict ? ' Certificates cannot be issued until it does.' : ''}`,
          },
    );
  }
  for (const port of [80, 443]) {
    const open = await ctx.network.reachable(target.host, port);
    checks.push(
      open
        ? { name: `Port ${port}`, status: 'ok', detail: `answers on ${target.host}` }
        : {
            name: `Port ${port}`,
            status: strict ? 'fail' : 'warn',
            detail: `nothing answers on ${target.host}`,
            fix: 'Open it in the firewall and at the router, and make sure nothing else listens on it. It answers once the first deployment has run.',
          },
    );
  }

  const failed = checks.filter((check) => check.status === 'fail');
  if (args.switches.has('json')) {
    ctx.io.out(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
  } else {
    for (const check of checks) {
      ctx.io.out(
        `${{ ok: 'ok  ', warn: 'warn', fail: 'FAIL' }[check.status]}  ${check.name}: ${check.detail}`,
      );
      if (check.fix && check.status !== 'ok') ctx.io.out(`      ${check.fix}`);
    }
  }
  if (failed.length > 0) {
    throw new Failed(
      `${failed.length} check${failed.length === 1 ? '' : 's'} failed.`,
      'Fix what is listed, then run sv doctor again.',
    );
  }
}

/** `sv app show NAME [--secret]` (operator-cli §4.2). The secret is printed by this command and by nothing else. */
export async function appShow(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { secret: 'switch', json: 'switch' });
  const [name] = positionals(args, 1, 'sv app show NAME [--secret] [--json]');
  const suite = (await SuiteFile.load(ctx.root)).value;
  if (!suite.apps?.[name as string]) throw new Refused(`${name} is not an app in suite.yml.`);
  const target = targetOf(suite);
  if (args.switches.has('secret')) {
    const text = await ask(ctx, target, ['app', name as string, '--secret'], 'Reading the secret');
    ctx.io.out(text.trim());
    return;
  }
  const found = json<Record<string, unknown>>(
    await ask(ctx, target, ['app', name as string], 'Reading the app'),
  );
  if (args.switches.has('json')) {
    ctx.io.out(JSON.stringify(found, null, 2));
    return;
  }
  const app = suite.apps[name as string];
  const origin = app && !isExternal(app) ? `https://${name}.${suite.domain}` : undefined;
  ctx.io.out(`${name} (${String(found.kind)})`);
  if (origin) ctx.io.out(`  address     ${origin}`);
  ctx.io.out(`  client ID   ${String(found.clientId ?? 'none')}`);
  if (found.healthy !== undefined) ctx.io.out(`  healthy     ${found.healthy ? 'yes' : 'no'}`);
  if (found.version) ctx.io.out(`  version     ${String(found.version)}`);
  if (found.database) ctx.io.out(`  database    ${String(found.database)}`);
  ctx.io.out('  sv app show NAME --secret prints its client secret.');
}

/** `sv secret rotate APP` (operator-cli §9.3). */
export async function secretRotate(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { yes: 'switch' });
  const [name] = positionals(args, 1, 'sv secret rotate APP [--yes]');
  const suite = (await SuiteFile.load(ctx.root)).value;
  const app = suite.apps?.[name as string];
  if (!app) throw new Refused(`${name} is not an app in suite.yml.`);
  await confirm(
    ctx.io,
    `The old secret of ${name} stops working at once. ${isExternal(app) ? `${name} will not sign anyone in until it is given the new one.` : `${name} is restarted.`} Go on?`,
    args.switches.has('yes'),
  );
  await ask(ctx, targetOf(suite), ['rotate', name as string], 'Rotating the secret');
  ctx.io.err(
    isExternal(app)
      ? `Rotated. Give ${name} the new secret: sv app show ${name} --secret`
      : `Rotated and restarted ${name}.`,
  );
}
