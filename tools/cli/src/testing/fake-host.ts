import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { Host, Ran } from '../apply/host.js';
import type { Registry } from '../registry.js';

type Container = {
  id: string;
  startedAt: number;
  configHash: string;
  networks: Record<string, Set<string>>;
  health: 'healthy';
};

/**
 * A Docker that is pretended, faithfully enough to run `sv apply` against: networks exist once made, `compose up` makes a container
 * and leaves it alone when the configuration it is given is the same (which is what makes a second deployment change nothing), and
 * every call is kept, so a test can see what was run, in what order, and that no secret was on a command line.
 */
export class FakeDocker {
  calls: { args: string[]; input?: string; inputFrom?: string }[] = [];
  networks = new Set<string>();
  containers = new Map<string, Container>();
  psql: string[] = [];
  /** What the question about connections is answered with (apply/database-use.ts), as JSON text; empty is an answer that cannot be read. */
  connectionsReport = '';
  caddyReloads = 0;
  /** What was run once with `compose run`, after the word run. */
  composeRuns: string[][] = [];
  /** What `sovereign-admin instance deletions export` prints. */
  deletionsExport = '{"deleted":[]}';
  /** Where the proxy’s folder is on the host, from the compose file it was started with. */
  caddyDir: string | undefined;
  /** Fails the n-th call (counting from 0) with this message, once. */
  failAt: { n: number; message: string } | undefined;
  /** Fails any call whose joined arguments contain this text. */
  failOn: { text: string; message: string } | undefined;
  engine = '27.0.1';
  compose = '2.29.1';
  verifyCode = 0;
  /** Clients core has made, by app name, so that a second `apps ensure` returns no secret, as the real one does. */
  clients = new Map<string, { clientId: string; confidential: boolean }>();
  /** Apps whose health path does not answer. */
  unhealthy = new Set<string>();
  /** Apps whose container will not start. */
  wontStart = new Set<string>();
  /** Volumes, by compose project label. */
  volumes: Record<string, string[]> = {};
  #next = 0;
  #clock = 1_800_000_000_000;

  /** Containers by name that compose projects make. */
  static readonly SERVICES: Record<string, string> = {
    'sovereign-database': 'sv-database',
    'sovereign-proxy': 'sv-proxy',
    'sovereign-core': 'sv-core',
    'sovereign-mailpit': 'sv-mailpit',
  };

  async run(
    args: readonly string[],
    options: { input?: string; inputFrom?: string; stdoutTo?: string } = {},
  ): Promise<Ran> {
    const n = this.#next++;
    this.calls.push({
      args: [...args],
      ...(options.input === undefined ? {} : { input: options.input }),
      ...(options.inputFrom === undefined ? {} : { inputFrom: options.inputFrom }),
    });
    const joined = args.join(' ');
    if (this.failAt && this.failAt.n === n) {
      const message = this.failAt.message;
      this.failAt = undefined;
      return { code: 1, stdout: '', stderr: message };
    }
    if (this.failOn && joined.includes(this.failOn.text)) {
      return { code: 1, stdout: '', stderr: this.failOn.message };
    }
    const [command, ...rest] = args;
    if (command === 'version') return ok(this.engine);
    if (command === 'compose' && rest[0] === 'version') return ok(this.compose);
    if (command === 'network') return this.#network(rest);
    if (command === 'compose') return this.#composeUp(rest);
    if (command === 'inspect') return this.#inspect(rest);
    if (command === 'cp') {
      writeFileSync(
        args[args.length - 1] as string,
        '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n',
      );
      return ok('');
    }
    if (command === 'exec') return this.#exec(rest, options);
    if (command === 'ps') {
      const prefix = (rest[rest.indexOf('--filter') + 1] ?? '').replace('name=^', '');
      return ok([...this.containers.keys()].filter((name) => name.startsWith(prefix)).join('\n'));
    }
    if (command === 'stop') {
      for (const name of rest) this.containers.delete(name);
      return ok('');
    }
    if (command === 'rm') {
      for (const name of rest.filter((word) => !word.startsWith('-'))) this.containers.delete(name);
      return ok('');
    }
    if (command === 'volume') {
      if (rest[0] === 'ls') {
        const project = (
          rest.find((word) => word.startsWith('label=com.docker.compose.project=')) ?? ''
        )
          .split('=')
          .pop() as string;
        return ok((this.volumes[project] ?? []).join('\n'));
      }
      if (rest[0] === 'inspect') {
        const found = Object.values(this.volumes).some((list) => list.includes(rest[1] as string));
        return found ? ok('[]') : { code: 1, stdout: '', stderr: 'No such volume' };
      }
      if (rest[0] === 'create') {
        const name = rest[rest.length - 1] as string;
        const project = name.split('_')[0] as string;
        (this.volumes[project] ??= []).push(name);
        return ok(name);
      }
      if (rest[0] === 'rm') {
        for (const list of Object.values(this.volumes)) {
          const at = list.indexOf(rest[1] as string);
          if (at >= 0) list.splice(at, 1);
        }
        return ok('');
      }
    }
    // `docker run` is how a check is made from inside an app's network namespace.
    if (command === 'run')
      return {
        code: this.verifyCode,
        stdout: '',
        stderr: this.verifyCode === 0 ? '' : 'certificate verify failed',
      };
    return { code: 1, stdout: '', stderr: `the fake docker does not know ${joined}` };
  }

  #network(rest: string[]): Ran {
    const [verb, ...more] = rest;
    if (verb === 'inspect')
      return this.networks.has(more[0] as string)
        ? ok('[]')
        : { code: 1, stdout: '', stderr: 'No such network' };
    if (verb === 'create') {
      this.networks.add(more[more.length - 1] as string);
      return ok('');
    }
    if (verb === 'rm') {
      this.networks.delete(more[0] as string);
      return ok('');
    }
    if (verb === 'connect' || verb === 'disconnect') {
      const aliases: string[] = [];
      for (let i = 0; i < more.length; i += 1)
        if (more[i] === '--alias') aliases.push(more[++i] as string);
      const [network, container] = more
        .filter((word, i) => word !== '--alias' && more[i - 1] !== '--alias')
        .slice(-2) as [string, string];
      const found = this.containers.get(container);
      if (!found) return { code: 1, stdout: '', stderr: 'No such container' };
      if (verb === 'disconnect') Reflect.deleteProperty(found.networks, network);
      else found.networks[network] = new Set([container, found.id.slice(0, 12), ...aliases]);
      return ok('');
    }
    return { code: 1, stdout: '', stderr: 'unknown network command' };
  }

  #composeUp(rest: string[]): Ran {
    if (rest.includes('run')) {
      this.composeRuns.push(rest.slice(rest.indexOf('run')));
      return ok('');
    }
    const project = rest[rest.indexOf('--project-name') + 1] as string;
    const files = rest.flatMap((word, i) => (rest[i - 1] === '-f' ? [word] : []));
    const name = project.startsWith('sovereign-app-')
      ? `sv-app-${project.slice('sovereign-app-'.length)}`
      : FakeDocker.SERVICES[project];
    if (!name) return { code: 1, stdout: '', stderr: `unknown project ${project}` };
    if (rest.includes('down')) {
      this.containers.delete(name);
      return ok('');
    }
    // Compose recreates a container when what it is given differs, and otherwise leaves it running.
    const hash = createHash('sha256')
      .update(files.map((file) => readFileSync(file, 'utf8')).join('\n---\n'))
      .digest('hex');
    if (project === 'sovereign-proxy') {
      const parsed = parse(readFileSync(files[0] as string, 'utf8')) as {
        services: Record<string, { volumes: { target: string; source: string }[] }>;
      };
      this.caddyDir = Object.values(parsed.services)[0]?.volumes.find(
        (volume) => volume.target === '/etc/caddy',
      )?.source;
    }
    if (this.wontStart.has(name))
      return { code: 1, stdout: '', stderr: `${name} exited with code 1` };
    const existing = this.containers.get(name);
    if (!existing || existing.configHash !== hash) {
      this.containers.set(name, {
        id: createHash('sha256').update(`${name}${hash}${this.#clock}`).digest('hex'),
        startedAt: (this.#clock += 1000),
        configHash: hash,
        networks: {
          [name.startsWith('sv-app-') ? `sv-net-app-${name.slice(7)}` : 'sv-net-core']: new Set([
            name,
          ]),
        },
        health: 'healthy',
      });
    }
    return ok('');
  }

  #inspect(rest: string[]): Ran {
    if (rest[0] === '--format' && rest[1] === '{{.State.Running}}') {
      return this.containers.has(rest[2] as string)
        ? ok('true')
        : { code: 1, stdout: '', stderr: 'No such object' };
    }
    if (rest[0] === '--format') {
      const lines = rest.slice(2).flatMap((name) => {
        const found = this.containers.get(name);
        return found ? [`/${name} ${found.id} ${found.startedAt}`] : [];
      });
      return ok(lines.join('\n'));
    }
    const found = this.containers.get(rest[0] as string);
    if (!found) return { code: 1, stdout: '', stderr: 'No such container' };
    const networks = Object.fromEntries(
      Object.entries(found.networks).map(([network, aliases]) => [
        network,
        { Aliases: [...aliases] },
      ]),
    );
    return ok(JSON.stringify([{ NetworkSettings: { Networks: networks } }]));
  }

  #admin(more: string[]): Ran {
    const [group, verb, name] = more;
    if (group === 'instance' && verb === 'deletions' && name === 'export')
      return ok(this.deletionsExport);
    if (group !== 'apps' || !name) return { code: 1, stdout: '', stderr: 'unknown admin command' };
    if (verb === 'ensure') {
      const known = this.clients.get(name);
      if (known) return ok(JSON.stringify({ clientId: known.clientId }));
      const confidential = !more.includes('--public');
      this.clients.set(name, { clientId: `client-${name}`, confidential });
      return ok(
        JSON.stringify({
          clientId: `client-${name}`,
          ...(confidential ? { secret: `secret-of-${name}` } : {}),
        }),
      );
    }
    if (verb === 'rotate-secret')
      return ok(JSON.stringify({ secret: `rotated-secret-of-${name}` }));
    if (verb === 'remove') {
      if (!this.clients.delete(name))
        return { code: 1, stdout: '', stderr: `There is no app ${name}.` };
      return ok('');
    }
    return { code: 1, stdout: '', stderr: `unknown admin command ${verb}` };
  }

  #exec(rest: string[], options: { input?: string; stdoutTo?: string }): Ran {
    const words = rest.filter((word) => word !== '-i');
    const [container, program, ...more] = words;
    if (!this.containers.has(container as string))
      return { code: 1, stdout: '', stderr: `No such container: ${container}` };
    if (program === 'psql') {
      if ((options.input ?? '').includes('json_build_object')) return ok(this.connectionsReport);
      this.psql.push(options.input ?? '');
      return ok('');
    }
    if (program === 'pg_dumpall') {
      if (options.stdoutTo) {
        writeFileSync(options.stdoutTo, '-- dump of every database\nCREATE ROLE core;\n');
      }
      return ok('');
    }
    if (program === 'caddy' && more[0] === 'reload') {
      this.caddyReloads += 1;
      return ok('');
    }
    if (program === 'cat' && more[0] === '/etc/caddy/Caddyfile' && this.caddyDir)
      return ok(readFileSync(path.join(this.caddyDir, 'Caddyfile'), 'utf8'));
    if (program === 'test') return ok('');
    if (program === 'wget') {
      const app = /sv-app-([a-z0-9-]+)/.exec(more.join(' '))?.[1] ?? '';
      return this.unhealthy.has(app)
        ? { code: 1, stdout: '', stderr: 'wget: server returned error: HTTP/1.1 503' }
        : ok('');
    }
    if (program === 'sovereign-admin') return this.#admin(more);
    if (program === 'node')
      return {
        code: this.verifyCode,
        stdout: '',
        stderr: this.verifyCode === 0 ? '' : 'discovery answered 502',
      };
    return { code: 1, stdout: '', stderr: `the fake docker does not know exec ${program}` };
  }
}

const ok = (stdout: string): Ran => ({ code: 0, stdout, stderr: '' });

export function fakeHost(
  options: {
    docker?: FakeDocker;
    resolves?: Record<string, string[]>;
    free?: number;
    alive?: Set<number>;
    pid?: number;
    registry?: Registry;
  } = {},
) {
  const docker = options.docker ?? new FakeDocker();
  const logs: string[] = [];
  let counter = 0;
  const host: Host = {
    docker: (args, callOptions) => docker.run(args, callOptions),
    resolve: async (name) => options.resolves?.[name] ?? [],
    freeBytes: async () => options.free ?? 50 * 1024 ** 3,
    fetch: (() => Promise.reject(new Error('no network in the test'))) as typeof fetch,
    // Distinct and repeatable: the same secrets every time a test is run.
    random: (bytes) =>
      Buffer.alloc(bytes, `abcdefghijklmnopqrstuvwxyz0123456789`.charCodeAt(counter++ % 36)),
    now: () => 1_800_000_000_000,
    sleep: async () => undefined,
    alive: (pid) => options.alive?.has(pid) ?? false,
    pid: options.pid ?? 4242,
    ...(options.registry ? { registry: options.registry } : {}),
    log: (line) => logs.push(line),
  };
  return { host, docker, logs };
}
