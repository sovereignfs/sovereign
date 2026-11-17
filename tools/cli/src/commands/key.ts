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
import {
  accountWrapData,
  formatEscrowKey,
  formatKit,
  fromBase64Url,
  kitKey,
  newKey,
  openEscrowWrap,
  parseEscrowKey,
  toBase64Url,
  wrapSecret,
} from '@sovereignfs/crypto/web';
import { readFile } from 'node:fs/promises';
import type { webcrypto } from 'node:crypto';

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
  if (what === 'escrow') return escrow(ctx, rest);
  if (what !== 'recovery') {
    throw new Refused(
      'Usage: sv key recovery [--out FILE] [--remove] | sv key escrow [--out FILE] | sv key escrow open --key FILE --out FILE [RECORD]',
    );
  }
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

/** The first line of an escrow key's private half, which `sv key escrow open` reads back. */
const ESCROW_SECRET = 'SV-ESCROW-SECRET-1.';

/** Where a key is written: outside the instance repository, never over a file. */
function keyFile(ctx: Context, out: string | undefined, what: string): string | undefined {
  if (out === undefined) return undefined;
  const file = path.resolve(out);
  const relative = path.relative(ctx.root, file);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Refused(
      `${what} is never kept in the instance repository.`,
      'Write it somewhere else with --out, such as a USB stick you keep apart.',
    );
  }
  if (existsSync(file)) throw new Refused(`${file} already exists.`);
  return file;
}

/**
 * `sv key escrow` (operator-cli §9.5, core-app §5.8): an X25519 key pair for recovering people's encrypted data, made here. The private
 * half is shown once or written outside the repository, as a recovery key is, and never reaches the server, a backup or the
 * repository. The public half is one line the owner pastes into the Console, which is how escrow is turned on: the owner's alone.
 *
 * `sv key escrow open --key FILE --out FILE [RECORD]` opens one person's account key here, from the escrow way in that
 * `sovereign-admin accounts escrow-record EMAIL` gave (the file RECORD, or standard input), makes a new recovery kit for them, and writes
 * its way in to `--out` for `sovereign-admin accounts put-kit EMAIL`. The kit is shown once, for the operator to give the person.
 */
async function escrow(ctx: Context, argv: string[]): Promise<void> {
  if (argv[0] === 'open') return escrowOpen(ctx, argv.slice(1));
  const args = parseArgs(argv, { out: 'value' });
  positionals(args, 0, 'sv key escrow [--out FILE]');
  const file = keyFile(ctx, args.values.get('out'), 'An escrow key');
  if (file === undefined && !ctx.io.interactive) {
    throw new Refused(
      'An escrow key is shown once, and there is no terminal to show it in.',
      'Write it to a file outside the repository with --out FILE.',
    );
  }
  const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ])) as unknown as { publicKey: webcrypto.CryptoKey; privateKey: webcrypto.CryptoKey };
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const line = await formatEscrowKey(publicKey);
  const secret = `${ESCROW_SECRET}${toBase64Url(pkcs8)}`;
  pkcs8.fill(0);
  if (file !== undefined) {
    await writeFile(
      file,
      `# Sovereign escrow key, made ${new Date(ctx.now()).toISOString()}\n# public key: ${line}\n${secret}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    ctx.io.err(
      `Wrote the escrow key to ${file}. Keep it offline, apart from this machine and the server.`,
    );
  } else {
    ctx.io.err(
      'The next line is the escrow key. It is shown this once and kept nowhere: put it in a password manager or on paper now, away from this machine and the server.',
    );
    ctx.io.out(secret);
  }
  ctx.io.err(
    'To turn recovery on, the owner pastes this line into the Console, under Settings, Recovery of encrypted data:',
  );
  ctx.io.out(line);
  ctx.io.err(
    'Each person is told, and covered, the next time they open an app that uses encryption. Turning it off later leaves those already covered covered.',
  );
}

async function escrowOpen(ctx: Context, argv: string[]): Promise<void> {
  const usage = 'sv key escrow open --key FILE --out FILE [RECORD]';
  const args = parseArgs(argv, { key: 'value', out: 'value' });
  if (args.positionals.length > 1) throw new Refused(`Usage: ${usage}`);
  const [recordFile] = args.positionals;
  const keyPath = args.values.get('key');
  if (keyPath === undefined) throw new Refused(`--key is needed. Usage: ${usage}`);
  const out = keyFile(ctx, args.values.get('out'), "A recovery kit's way in");
  if (out === undefined) throw new Refused(`--out is needed. Usage: ${usage}`);
  if (!ctx.io.interactive) {
    throw new Refused(
      'The new recovery kit is shown once, and there is no terminal to show it in.',
    );
  }

  const keyText = await readFile(path.resolve(keyPath), 'utf8');
  const secretLine = keyText.split('\n').find((each) => each.startsWith(ESCROW_SECRET));
  const publicLine = /# public key: (\S+)/.exec(keyText)?.[1];
  const parsed = publicLine ? await parseEscrowKey(publicLine) : undefined;
  const pkcs8 = secretLine ? fromBase64Url(secretLine.slice(ESCROW_SECRET.length)) : undefined;
  if (!parsed || !pkcs8) throw new Refused(`${keyPath} is not an escrow key sv key escrow wrote.`);
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, false, [
    'deriveBits',
  ]);
  pkcs8.fill(0);

  const recordText =
    recordFile === undefined ? await ctx.io.readStdin() : await readFile(recordFile, 'utf8');
  let given: { sub?: unknown; escrowKeyId?: unknown; record?: unknown };
  try {
    given = JSON.parse(recordText) as typeof given;
  } catch {
    throw new Refused('That is not what sovereign-admin accounts escrow-record gave.');
  }
  if (typeof given.sub !== 'string' || typeof given.escrowKeyId !== 'string') {
    throw new Refused('That is not what sovereign-admin accounts escrow-record gave.');
  }
  if (given.escrowKeyId !== parsed.id) {
    throw new Refused(
      'That escrow way in was made for another escrow key.',
      'Use the key whose public line was in the Console when the person was covered.',
    );
  }
  const accountKey = await openEscrowWrap({
    record: given.record,
    sub: given.sub,
    escrowKeyId: parsed.id,
    escrow: { privateKey, publicKey: parsed.publicKey },
  }).catch(() => {
    throw new Refused('The escrow key does not open that way in.');
  });
  const kit = newKey();
  try {
    const record = await wrapSecret(
      await kitKey(kit),
      accountKey,
      accountWrapData(given.sub, 'kit'),
    );
    await writeFile(out, `${JSON.stringify({ sub: given.sub, record })}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    ctx.io.err(
      'The next line is the person’s new recovery kit. Give it to them in person or by a channel you trust; it is shown this once:',
    );
    ctx.io.out(await formatKit(kit));
    ctx.io.err(
      `Wrote its way in to ${out}. Store it with: sovereign-admin accounts put-kit EMAIL ${path.basename(out)} (in core's container), then give the person a reset link (sovereign-admin accounts reset-link EMAIL). They set a password, then unlock with the kit, and their password unlocks from then on. Delete ${out} afterwards.`,
    );
  } finally {
    kit.fill(0);
    accountKey.fill(0);
  }
}
