import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Refused } from '../errors.js';
import { targetOf } from '../server/remote.js';
import { environmentOf } from '../suite/environment.js';
import { SuiteFile } from '../suite/files.js';
import { ask } from './remote.js';

/**
 * `sv seed` (operator-cli §4.4): makes the accounts and the sample app on a development or staging instance, through
 * `sovereign-admin seed` in core's container (core-app §3.15.1). It is the first of two checks: a production instance is refused here,
 * before anything is sent, and core refuses on its own as well. The answer holds the password of each account made, on staging a random
 * one, and is shown once to whoever asked: it is printed and never written anywhere.
 */
export async function seed(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { json: 'switch' });
  positionals(args, 0, 'sv seed [--json]');
  const suite = (await SuiteFile.load(ctx.root)).value;
  const environment = environmentOf(suite);
  if (environment === 'production') {
    throw new Refused(
      'A production instance is never seeded.',
      'environment in suite.yml says what the instance is for. Only development and staging may be seeded.',
    );
  }
  const out = await ask(
    ctx,
    targetOf(suite),
    ['seed', ...(args.switches.has('json') ? ['--json'] : [])],
    'Seeding',
  );
  ctx.io.out(out.trimEnd());
}
