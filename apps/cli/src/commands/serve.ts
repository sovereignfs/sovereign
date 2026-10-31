import path from 'node:path';
import { realReceiverHost, type Host } from '../apply/host.js';
import { layout } from '../apply/state.js';
import { parseArgs } from '../args.js';
import { Refused } from '../errors.js';
import type { Io } from '../io.js';
import { ensureOperatorKey } from '../secrets/keys.js';
import { receive, type ReceiverHost } from '../server/receive.js';

const stateDirOf = (value: string | undefined) =>
  path.resolve(value ?? process.env.SV_STATE_DIR ?? '/var/lib/sovereign');

const readAll = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
};

/**
 * `sv receive` (operator-cli §8): runs on the server, in the toolkit’s image, started by the wrapper `sv server bootstrap` installs. It
 * answers the one request the wrapper hands it. It is not run by hand, and it returns the exit code the request ends with.
 */
export async function receiveCommand(
  io: Io,
  argv: string[],
  options: {
    host?: ReceiverHost;
    stdin?: () => Promise<Buffer>;
    write?: (text: string) => void;
  } = {},
): Promise<number> {
  // What follows the first `--` is the request, one word and never read as an option, however it begins.
  const split = argv.indexOf('--');
  const request = split === -1 ? undefined : argv.slice(split + 1);
  const args = parseArgs(split === -1 ? argv : argv.slice(0, split), {
    'deploy-only': 'switch',
    'state-dir': 'value',
    'no-publish-ports': 'switch',
    'skip-dns': 'switch',
  });
  if (request?.length !== 1 || args.positionals.length > 0)
    throw new Refused('sv receive needs the request.', 'The wrapper on the server gives it.');
  return receive(options.host ?? realReceiverHost((line) => io.err(line)), {
    line: request[0] as string,
    deployOnly: args.switches.has('deploy-only'),
    stateDir: stateDirOf(args.values.get('state-dir')),
    stdin: options.stdin ?? (() => readAll(process.stdin)),
    out: options.write ?? ((text) => void process.stdout.write(text)),
    applyFlags: [
      ...(args.switches.has('no-publish-ports') ? ['--no-publish-ports'] : []),
      ...(args.switches.has('skip-dns') ? ['--skip-dns'] : []),
    ],
  });
}

/** `sv server-key` (operator-cli §8.3): on the server, makes the key that decrypts `secrets.age.yml` if there is none, and prints the public half. */
export async function serverKeyCommand(io: Io, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { 'state-dir': 'value' });
  const file = layout(stateDirOf(args.values.get('state-dir'))).ageKey;
  const { key } = await ensureOperatorKey(file);
  io.out(key.recipient);
}

export type { Host };
