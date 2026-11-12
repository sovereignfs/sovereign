import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateX25519Identity, identityToRecipient } from 'age-encryption';
import { isScalar, isSeq, type Document, type Scalar } from 'yaml';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Refused } from '../errors.js';
import { SuiteFile } from '../suite/files.js';
import { reencrypt } from './secret.js';

/** The comment a recovery key's recipient carries in `suite.yml`, which is how it is told from an operator's. */
const MARK = 'recovery key';

const recipientsOf = (doc: Document) => {
  const seq = doc.getIn(['secrets', 'recipients'], true);
  if (!isSeq(seq)) throw new Refused('suite.yml has no secrets.recipients.');
  return seq;
};
const isRecovery = (item: unknown) =>
  isScalar(item) && (item.comment ?? '').trim() === MARK && typeof item.value === 'string';

/**
 * `sv key recovery` (operator-cli §9.4): a second key, kept offline, among the recipients, so that losing the operator's key does not lose
 * every backup and secret. Its private half is shown once, or written to a file outside the repository, and never kept by `sv`.
 * `--remove` takes every recovery key out of the recipients.
 */
export async function key(ctx: Context, argv: string[]): Promise<void> {
  const [what, ...rest] = argv;
  if (what !== 'recovery') throw new Refused('Usage: sv key recovery [--out FILE] [--remove]');
  const args = parseArgs(rest, { out: 'value', remove: 'switch' });
  positionals(args, 0, 'sv key recovery [--out FILE] [--remove]');
  const suite = await SuiteFile.load(ctx.root);

  if (args.switches.has('remove')) {
    if (args.values.has('out')) throw new Refused('--remove takes no --out.');
    let removed = 0;
    await suite.edit((doc) => {
      const seq = recipientsOf(doc);
      const kept = seq.items.filter((item) => !isRecovery(item));
      removed = seq.items.length - kept.length;
      seq.items = kept;
    });
    if (removed === 0) {
      ctx.io.err('There is no recovery key among the recipients. Nothing was changed.');
      return;
    }
    const count = await reencrypt(ctx);
    ctx.io.err(
      `Removed ${removed} recovery key${removed === 1 ? '' : 's'} from secrets.recipients, and re-encrypted ${count} secret${count === 1 ? '' : 's'}. sv push and sv deploy, and backups taken after that leave it out.`,
    );
    ctx.io.err(
      'This does not take back what it could already read: the backups taken before, and the secrets as they were. Change those secrets at their source.',
    );
    return;
  }

  const out = args.values.get('out');
  const file = out === undefined ? undefined : path.resolve(out);
  if (file !== undefined) {
    const relative = path.relative(ctx.root, file);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      throw new Refused(
        'A recovery key is never kept in the instance repository.',
        'Write it somewhere else with --out, such as a USB stick you keep apart.',
      );
    }
    if (existsSync(file)) throw new Refused(`${file} already exists.`);
  } else if (!ctx.io.interactive) {
    throw new Refused(
      'A recovery key is shown once, and there is no terminal to show it in.',
      'Write it to a file outside the repository with --out FILE.',
    );
  }

  const identity = await generateX25519Identity();
  const recipient = await identityToRecipient(identity);
  // The private half goes where it is kept before suite.yml names its public half: a key that is lost first opens nothing.
  if (file !== undefined) {
    await writeFile(
      file,
      `# Sovereign recovery key, made ${new Date(ctx.now()).toISOString()}\n# public key: ${recipient}\n${identity}\n`,
      { mode: 0o600, flag: 'wx' },
    );
  }
  await suite.edit((doc) => {
    const node = doc.createNode(recipient) as Scalar;
    node.comment = ` ${MARK}`;
    recipientsOf(doc).items.push(node);
  });
  const count = await reencrypt(ctx);

  if (file === undefined) {
    ctx.io.out(identity);
    ctx.io.err(
      'That line is the recovery key. It is shown this once and kept nowhere: write it down or put it in a password manager now, away from this machine.',
    );
  } else {
    ctx.io.err(`Wrote the recovery key to ${file}. Keep it offline, apart from this machine.`);
  }
  ctx.io.err(
    `Added its public key to secrets.recipients and re-encrypted ${count} secret${count === 1 ? '' : 's'} to it. sv push and sv deploy: backups taken after that open with it too (sv restore PATH --key FILE).`,
  );
}
