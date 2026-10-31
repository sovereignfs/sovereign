import path from 'node:path';
import { apply } from '../apply/apply.js';
import { realHost, type Host } from '../apply/host.js';
import { parseArgs, positionals } from '../args.js';
import { Refused } from '../errors.js';
import type { Io } from '../io.js';

const OPTIONS = {
  from: 'value',
  commit: 'value',
  'state-dir': 'value',
  'no-publish-ports': 'switch',
  'skip-dns': 'switch',
  restore: 'switch',
} as const;

/**
 * `sv apply` (operator-cli §6): runs on the server, from the toolkit’s image, and is started by `sv deploy` and not by hand. It takes the
 * files of one commit and makes the server match them. `--no-publish-ports` is for a test that shares a machine with something on 80
 * and 443; a real deployment never passes it.
 */
export async function applyCommand(
  io: Io,
  argv: string[],
  host: Host = realHost((line) => io.err(line)),
): Promise<void> {
  const args = parseArgs(argv, OPTIONS);
  positionals(args, 0, 'sv apply --from DIR --commit HASH');
  const from = args.values.get('from');
  const commit = args.values.get('commit');
  if (!from || !commit)
    throw new Refused('sv apply needs --from DIR and --commit HASH.', 'sv deploy gives it both.');
  const stateDir = path.resolve(
    args.values.get('state-dir') ?? process.env.SV_STATE_DIR ?? '/var/lib/sovereign',
  );
  const result = await apply(host, {
    from: path.resolve(from),
    commit,
    stateDir,
    publishPorts: !args.switches.has('no-publish-ports'),
    skipDns: args.switches.has('skip-dns'),
    restore: args.switches.has('restore'),
  });
  io.err(result.changed ? `Applied ${commit}.` : `Applied ${commit}; nothing needed changing.`);
}
