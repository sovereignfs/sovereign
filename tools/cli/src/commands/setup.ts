import { parseArgs } from '../args.js';
import type { Context } from '../context.js';
import { newestPublishedCore } from '../core-version.js';
import { Refused } from '../errors.js';
import { askOrRefuse } from '../io.js';
import { RELEASE } from '../release.js';
import { ensureOperatorKey } from '../secrets/keys.js';
import { FILE, SuiteFile, readLock, writeLock } from '../suite/files.js';
import { refreshedLock } from '../suite/lock.js';
import { ENVIRONMENTS } from '../suite/environment.js';
import type { Environment, Suite } from '../suite/types.js';
import { DEPLOY_WORKFLOW, deployWorkflow } from '../suite/workflow.js';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OPTIONS = {
  domain: 'value',
  host: 'value',
  port: 'value',
  user: 'value',
  deploy: 'value',
  tls: 'value',
  'tls-email': 'value',
  environment: 'value',
} as const;

/**
 * `sv setup` (operator-cli §4.1): asks for the domain, the server and how to deploy, writes `suite.yml` on the newest core this toolkit
 * supports, pins what it resolves to in `suite.lock`, and makes the operator's key if there is none. It changes files and nothing else, and it will not overwrite a
 * `suite.yml` that is there.
 */
export async function setup(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, OPTIONS);
  if (args.positionals.length > 0)
    throw new Refused(
      'Usage: sv setup [--domain D] [--host H] [--port N] [--user U] [--deploy ssh|github] [--tls per-host|internal] [--environment development|staging|production]',
    );
  if (existsSync(path.join(ctx.root, FILE.suite))) {
    throw new Refused(
      'suite.yml is already here.',
      'Edit it by hand, or use sv app and sv secret to change it. To start again, remove suite.yml and suite.lock first.',
    );
  }
  const { io } = ctx;
  const value = (name: keyof typeof OPTIONS) => args.values.get(name);

  const domain =
    value('domain') ??
    (await askOrRefuse(
      io,
      'The domain core is served on (for example sovereign.example.com):',
      '--domain',
    ));
  const host =
    value('host') ??
    (await askOrRefuse(io, 'The server’s address (a host name or an IP):', '--host', domain));
  const deploy =
    value('deploy') ??
    (io.interactive ? await io.ask('How to deploy (ssh or github):', 'ssh') : 'ssh');
  const tls =
    value('tls') ??
    (io.interactive
      ? await io.ask(
          'Certificates (per-host, or internal for a machine with no public port):',
          'per-host',
        )
      : 'per-host');
  const environment =
    value('environment') ??
    (io.interactive
      ? await io.ask(
          'What it is for (development and staging catch mail in Mailpit; production sends it):',
          'production',
        )
      : 'production');
  if (!ENVIRONMENTS.includes(environment as Environment)) {
    throw new Refused(
      `${environment} is not an environment.`,
      'Use development, staging or production.',
    );
  }
  const email =
    value('tls-email') ??
    (tls === 'per-host' && io.interactive
      ? await io.ask('An address the certificate authority may write to (optional):', '')
      : '');
  const port = value('port');
  const user = value('user');

  const { key, created } = await ensureOperatorKey(ctx.keyFile);

  const suite: Suite = {
    schema: 1,
    domain,
    environment: environment as Environment,
    core: { version: await newestPublishedCore(ctx.registry, (message) => io.err(message)) },
    database: { version: RELEASE.database },
    server: {
      host,
      ...(port ? { port: Number(port) } : {}),
      ...(user ? { user } : {}),
      deploy: deploy as 'ssh' | 'github',
    },
    tls: { mode: tls as 'per-host' | 'internal', ...(email ? { email } : {}) },
    secrets: { recipients: [key.recipient] },
  };
  // The file is checked before anything is written, so a mistyped answer leaves nothing behind.
  const file = SuiteFile.create(ctx.root, suite);
  const lock = await refreshedLock(file.value, await readLock(ctx.root), (ref) =>
    ctx.registry.digest(ref),
  );
  await file.save();
  await writeLock(ctx.root, lock);
  if (deploy === 'github') {
    const workflow = path.join(ctx.root, DEPLOY_WORKFLOW);
    if (!existsSync(workflow)) {
      await mkdir(path.dirname(workflow), { recursive: true });
      await writeFile(workflow, deployWorkflow());
      io.err(
        `Wrote ${DEPLOY_WORKFLOW}, which deploys on every push to main with the deployment key.`,
      );
    }
  }

  io.err(`Wrote ${FILE.suite} for ${domain}, and ${FILE.lock} with the digests it resolves to.`);
  io.err(
    created
      ? `Made your key at ${key.file}. Keep it: it is the only way to read the secrets you add, and it is not in the repository.`
      : `Used your key at ${key.file}.`,
  );
  if (environment !== 'production')
    io.err(
      `This is a ${environment} instance: mail goes to Mailpit, and sv mail opens its inbox. Set SV_SMTP_HOST under core.env to send it somewhere else.`,
    );
  io.err('Next: sv server bootstrap, then sv push and sv deploy.');
}
