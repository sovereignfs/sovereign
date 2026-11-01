import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Failed, Refused } from '../errors.js';
import { targetOf } from '../server/remote.js';
import { MAIL_UI_PORT, environmentOf, usesMailpit } from '../suite/environment.js';
import { SuiteFile } from '../suite/files.js';

/**
 * `sv mail` (operator-cli §4.4): opens Mailpit's inbox on this machine, through SSH, and keeps it open until Ctrl-C. The inbox is on the
 * server's loopback address and nowhere else, since it holds the links that verify and reset accounts, so this is the only way to it.
 */
export async function mail(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { port: 'value' });
  positionals(args, 0, 'sv mail [--port N]');
  const suite = (await SuiteFile.load(ctx.root)).value;
  if (!usesMailpit(suite)) {
    throw new Refused(
      environmentOf(suite) === 'production'
        ? 'A production instance has no inbox: it sends mail for real.'
        : 'This instance sends mail through SV_SMTP_HOST, not Mailpit, so it has no inbox here.',
      environmentOf(suite) === 'production'
        ? 'Set environment: development or staging in suite.yml for an inbox that catches mail.'
        : 'Remove SV_SMTP_HOST from core.env to use Mailpit.',
    );
  }
  const asked = args.values.get('port') ?? String(MAIL_UI_PORT);
  const port = Number(asked);
  if (!/^[0-9]{1,5}$/.test(asked) || port < 1024 || port > 65535) {
    throw new Refused(`${asked} is not a port this can use.`, 'Use a number from 1024 to 65535.');
  }
  const target = targetOf(suite);
  ctx.io.err(
    `Mailpit's inbox is at http://localhost:${port} while this runs, through ssh to ${target.user}@${target.host}. Press Ctrl-C to close it.`,
  );
  const code = await ctx.tunnel(target, port, MAIL_UI_PORT);
  if (code !== 0) {
    throw new Failed(
      'The tunnel to the inbox ended with an error (ssh said why, above).',
      `Is something already using port ${port} here? Try --port. Is the instance deployed, and as development or staging?`,
    );
  }
}
