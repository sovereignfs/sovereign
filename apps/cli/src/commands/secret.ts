import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Refused } from '../errors.js';
import { readOperatorKey } from '../secrets/keys.js';
import { decryptValue, encryptValue, SecretsFile } from '../secrets/store.js';
import { SuiteFile, readLock } from '../suite/files.js';
import { isReservedCore, isReservedForApp } from '../suite/names.js';
import { manifestOf } from '../suite/apps.js';
import { isExternal } from '../suite/types.js';

const NAME = /^[A-Z][A-Z0-9_]*$/;

/** Reads the value without letting it reach the shell: from a hidden prompt, or standard input when there is no terminal. */
async function readValue(ctx: Context, name: string): Promise<string> {
  if (ctx.io.interactive) return ctx.io.askHidden(`Value for ${name} (hidden):`);
  const text = await ctx.io.readStdin();
  return text.replace(/\r?\n$/, '');
}

async function owner(ctx: Context, app: string | undefined, name: string) {
  const file = await SuiteFile.load(ctx.root);
  const suite = file.value;
  if (!NAME.test(name)) {
    throw new Refused(
      `${name} is not a variable name.`,
      'Use upper-case letters, digits and underscores, starting with a letter.',
    );
  }
  if (app === undefined) {
    if (!name.startsWith('SV_'))
      throw new Refused(`A secret for core begins with SV_, and ${name} does not.`);
    if (isReservedCore(name)) {
      throw new Refused(`${name} is made or refused by the deployment itself, and cannot be set.`);
    }
    return { owner: 'core', suite, file };
  }
  const entry = suite.apps?.[app];
  if (!entry) throw new Refused(`${app} is not an app in suite.yml.`);
  if (isExternal(entry)) {
    throw new Refused(`${app} is an external app: it runs elsewhere and has no environment here.`);
  }
  const manifest = await manifestOf(ctx, suite, await readLock(ctx.root), app);
  if (!name.startsWith(`${manifest.prefix}_`)) {
    throw new Refused(`A secret for ${app} begins with ${manifest.prefix}_, and ${name} does not.`);
  }
  if (isReservedForApp(name, manifest.prefix, manifest.generate)) {
    throw new Refused(`${name} is given to ${app} by the deployment, and cannot be set.`);
  }
  return { owner: app, suite, file };
}

async function set(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { app: 'value' });
  const [name] = positionals(
    args,
    1,
    'sv secret set NAME [--app APP]   (the value is read from a hidden prompt or standard input)',
  );
  const { owner: who, suite } = await owner(ctx, args.values.get('app'), name as string);
  const value = await readValue(ctx, name as string);
  if (value === '') throw new Refused('The value is empty. Nothing was changed.');
  const secrets = await SecretsFile.load(ctx.root);
  secrets.set(who, name as string, await encryptValue(value, suite.secrets.recipients));
  await secrets.save();
  ctx.io.err(
    `Encrypted ${name} for ${who} to ${suite.secrets.recipients.length} recipient${suite.secrets.recipients.length === 1 ? '' : 's'}. The value was not written anywhere else.`,
  );
}

async function remove(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { app: 'value' });
  const [name] = positionals(args, 1, 'sv secret remove NAME [--app APP]');
  const who = args.values.get('app') ?? 'core';
  const secrets = await SecretsFile.load(ctx.root);
  if (!secrets.remove(who, name as string))
    throw new Refused(`${who} has no secret called ${name}.`);
  await secrets.save();
  ctx.io.err(`Removed ${name} from ${who}.`);
}

async function list(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { json: 'switch' });
  positionals(args, 0, 'sv secret list [--json]');
  const value = (await SecretsFile.load(ctx.root)).value;
  const rows = Object.entries(value).flatMap(([who, names]) =>
    Object.keys(names).map((name) => ({ owner: who, name })),
  );
  if (args.switches.has('json')) {
    ctx.io.out(JSON.stringify({ secrets: rows }, null, 2));
    return;
  }
  if (rows.length === 0) ctx.io.out('No secrets. sv secret set adds one.');
  for (const row of rows) ctx.io.out(`${row.owner}\t${row.name}`);
}

async function rekey(ctx: Context, argv: string[]): Promise<void> {
  positionals(parseArgs(argv, {}), 0, 'sv secret rekey');
  const suite = (await SuiteFile.load(ctx.root)).value;
  const key = await readOperatorKey(ctx.keyFile);
  if (!key)
    throw new Refused(
      `There is no key at ${ctx.keyFile}.`,
      'Only a recipient’s key can decrypt a secret to encrypt it again.',
    );
  const secrets = await SecretsFile.load(ctx.root);
  let count = 0;
  for (const [who, names] of Object.entries(secrets.value)) {
    for (const [name, armored] of Object.entries(names)) {
      const plain = await decryptValue(armored, key.identity);
      secrets.set(who, name, await encryptValue(plain, suite.secrets.recipients));
      count += 1;
    }
  }
  await secrets.save();
  ctx.io.err(
    `Re-encrypted ${count} secret${count === 1 ? '' : 's'} to ${suite.secrets.recipients.length} recipient${suite.secrets.recipients.length === 1 ? '' : 's'}.`,
  );
  ctx.io.err(
    'Removing a recipient and re-keying does not take back what they could already read. Change those secrets at their source.',
  );
}

/** `sv secret ...` (operator-cli §4.3). A value is never taken as an argument, where the shell’s history and the process list would keep it. */
export async function secret(ctx: Context, argv: string[]): Promise<void> {
  const [verb, ...rest] = argv;
  switch (verb) {
    case 'set':
      return set(ctx, rest);
    case 'remove':
      return remove(ctx, rest);
    case 'list':
      return list(ctx, rest);
    case 'rekey':
      return rekey(ctx, rest);
    case 'rotate':
      throw new Refused(
        'sv secret rotate needs the server, and is not in this version of the toolkit yet.',
      );
    default:
      throw new Refused('Usage: sv secret set|remove|list|rekey|rotate');
  }
}
