import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateX25519Identity, identityToRecipient } from 'age-encryption';
import { Refused } from '../errors.js';

/** The operator's key: an age identity that stays outside the repository (operator-cli §9.1). */
export type OperatorKey = { identity: string; recipient: string; file: string };

/** Where the operator's key lives: `~/.config/sovereign/age.key`, or under `SV_CONFIG_DIR` / `XDG_CONFIG_HOME` when those are set. */
export function keyFile(env: NodeJS.ProcessEnv, home: string = os.homedir()): string {
  const base = env.SV_CONFIG_DIR
    ? path.resolve(env.SV_CONFIG_DIR)
    : path.join(
        env.XDG_CONFIG_HOME ? path.resolve(env.XDG_CONFIG_HOME) : path.join(home, '.config'),
        'sovereign',
      );
  return path.join(base, 'age.key');
}

const IDENTITY = /^AGE-SECRET-KEY-1[0-9A-Z]+$/m;

/** Reads the operator's key, or nothing when there is none. */
export async function readOperatorKey(file: string): Promise<OperatorKey | undefined> {
  if (!existsSync(file)) return undefined;
  const identity = IDENTITY.exec(await readFile(file, 'utf8'))?.[0];
  if (!identity) {
    throw new Refused(
      `${file} holds no age key.`,
      'Move it aside and run sv setup to make a new one, if you have no other copy.',
    );
  }
  return { identity, recipient: await identityToRecipient(identity), file };
}

/** Makes the operator's key if there is none, readable by its owner alone, and says whether it did. */
export async function ensureOperatorKey(
  file: string,
): Promise<{ key: OperatorKey; created: boolean }> {
  const existing = await readOperatorKey(file);
  if (existing) return { key: existing, created: false };
  const identity = await generateX25519Identity();
  const recipient = await identityToRecipient(identity);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(
    file,
    `# created: ${new Date().toISOString()}\n# public key: ${recipient}\n${identity}\n`,
    { mode: 0o600, flag: 'wx' },
  );
  await chmod(file, 0o600);
  return { key: { identity, recipient, file }, created: true };
}
