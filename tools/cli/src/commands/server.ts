import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { byDigest } from '../apply/render.js';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Failed, Locked, Refused } from '../errors.js';
import {
  DEPLOY_KEY_PREFIX,
  HOST_KEY_PREFIX,
  SERVER_KEY_PREFIX,
  bootstrapScript,
} from '../server/bootstrap-script.js';
import { targetOf, type RemoteResult } from '../server/remote.js';
import { SecretsFile } from '../secrets/store.js';
import { SuiteFile, readLock } from '../suite/files.js';
import { reencrypt } from './secret.js';

const lastLine = (text: string) => text.trim().split('\n').pop() ?? '';

/**
 * What a command printed last that says what went wrong. Tools end with a pointer ("Run 'docker run --help' for more information"), which
 * is no use to someone reading it, so it is passed over for the line above it.
 */
export function sayingOf(text: string): string {
  const lines = text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const said = lines.filter((line) => !/^(run|see) '.*--help'/i.test(line));
  return said.pop() ?? lines.pop() ?? '';
}

/** Turns a command that ended badly on the server into the error the operator sees (operator-cli §11). */
export function remoteFailure(result: RemoteResult, what: string): never {
  const said = sayingOf(result.stderr) || sayingOf(result.stdout);
  if (result.code === 255) {
    throw new Failed(
      `Could not reach the server over SSH: ${said || 'no answer'}`,
      'Check server.host, server.port and server.user in suite.yml, and that ssh to it works from this machine.',
    );
  }
  if (result.code === 2) throw new Refused(said || `The server refused ${what}.`);
  if (result.code === 3) throw new Locked(said || 'Another deployment holds the lock.');
  throw new Failed(
    `${what} failed on the server${said ? `: ${said}` : ''}.`,
    'Running it again is safe.',
  );
}

/** A key pair for the deployment key, made here so the private half never exists on the server. */
async function makeDeployKey(ctx: Context): Promise<{ publicKey: string; privateKey: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv-deploy-key-'));
  try {
    const file = path.join(dir, 'key');
    const made = await ctx.exec('ssh-keygen', [
      '-q',
      '-t',
      'ed25519',
      '-N',
      '',
      '-C',
      'sovereign-deploy',
      '-f',
      file,
    ]);
    if (made.code !== 0)
      throw new Failed(
        `ssh-keygen failed: ${lastLine(made.stderr)}`,
        'Install the OpenSSH client, which makes the deployment key.',
      );
    const [type, blob] = (await readFile(`${file}.pub`, 'utf8')).trim().split(/\s+/);
    return { publicKey: `${type} ${blob}`, privateKey: await readFile(file, 'utf8') };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function bootstrap(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { 'new-deploy-key': 'switch' });
  positionals(args, 0, 'sv server bootstrap [--new-deploy-key]');
  const file = await SuiteFile.load(ctx.root);
  const suite = file.value;
  const lock = await readLock(ctx.root);
  if (!lock) throw new Refused('There is no suite.lock.', 'sv setup writes one.');
  const target = targetOf(suite);
  const github = suite.server.deploy === 'github';
  const deployKey = github ? await makeDeployKey(ctx) : undefined;

  ctx.io.err(`Preparing ${target.user}@${target.host}. This installs Docker if it is not there.`);
  const script = bootstrapScript({
    image: byDigest(lock.images.cli),
    ...(deployKey ? { deployKey: deployKey.publicKey } : {}),
    rotate: args.switches.has('new-deploy-key'),
  });
  const result = await ctx.remote(
    target,
    target.user === 'root' ? ['sh', '-s'] : ['sudo', '-n', 'sh', '-s'],
    {
      input: script,
      onStderr: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
    },
  );
  if (result.code !== 0) {
    if (target.user !== 'root' && /sudo/.test(result.stderr))
      throw new Refused(
        `${target.user} cannot use sudo without a password.`,
        'Use server.user: root, or let that user run sudo without a password for this.',
      );
    remoteFailure(result, 'Preparing the server');
  }

  const serverKey = result.stdout
    .split('\n')
    .find((line) => line.startsWith(SERVER_KEY_PREFIX))
    ?.slice(SERVER_KEY_PREFIX.length)
    .trim();
  if (!serverKey || !/^age1[0-9a-z]+$/.test(serverKey)) {
    throw new Failed('The server did not say what its key is.', 'Run sv server bootstrap again.');
  }
  const installed = result.stdout.includes(`${DEPLOY_KEY_PREFIX}installed`);
  const hostKey = result.stdout
    .split('\n')
    .find((line) => line.startsWith(HOST_KEY_PREFIX))
    ?.slice(HOST_KEY_PREFIX.length)
    .trim();

  // The server can decrypt only what is encrypted to its key, so its key joins the recipients and what is already encrypted follows.
  let added = false;
  if (!suite.secrets.recipients.includes(serverKey)) {
    await file.edit((doc) => doc.addIn(['secrets', 'recipients'], serverKey));
    added = true;
    const held = Object.values((await SecretsFile.load(ctx.root)).value).some(
      (names) => Object.keys(names).length > 0,
    );
    if (held) {
      try {
        const count = await reencrypt(ctx);
        ctx.io.err(
          `Re-encrypted ${count} secret${count === 1 ? '' : 's'} so the server can read them.`,
        );
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
        ctx.io.err(
          `Warning: the secrets are not yet readable by the server. ${error.message} Run sv secret rekey from a machine that has the key.`,
        );
      }
    }
  }
  // A runner has no known_hosts of its own, so the server's host key is kept with the rest of what describes it.
  if (
    hostKey &&
    /^ssh-(ed25519|rsa) [A-Za-z0-9+/]+={0,2}$/.test(hostKey) &&
    hostKey !== suite.server.hostKey
  ) {
    await file.edit((doc) => doc.setIn(['server', 'hostKey'], hostKey));
    ctx.io.err(
      suite.server.hostKey
        ? 'The server’s host key has changed since it was last written; suite.yml has the new one.'
        : 'Wrote the server’s host key to suite.yml, so a runner can check it is deploying to the right machine.',
    );
  }
  ctx.io.err(
    added
      ? 'Added the server’s key to suite.yml. sv push commits it.'
      : 'The server’s key is already in suite.yml.',
  );
  if (deployKey && installed) {
    ctx.io.err(
      'The deployment key is below. It is shown once. Store it as a secret in the repository’s Actions settings (SV_DEPLOY_KEY), and keep no other copy.',
    );
    ctx.io.out(deployKey.privateKey.trimEnd());
  }
  ctx.io.err(`${target.host} is ready. sv push, then sv deploy.`);
}

/** `sv server ...` (operator-cli §8.3). */
export async function server(ctx: Context, argv: string[]): Promise<void> {
  const [verb, ...rest] = argv;
  if (verb === 'bootstrap') return bootstrap(ctx, rest);
  throw new Refused('Usage: sv server bootstrap [--new-deploy-key]');
}
