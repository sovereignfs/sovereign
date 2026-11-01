import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateX25519Identity, identityToRecipient } from 'age-encryption';
import { Document } from 'yaml';
import { refreshedLock } from '../suite/lock.js';
import { encryptValue } from '../secrets/store.js';
import type { Suite } from '../suite/types.js';

export type Source = {
  dir: string;
  stateDir: string;
  operator: { identity: string; recipient: string };
  server: { identity: string; recipient: string };
  suite: Suite;
};

const digestOf = (ref: string) =>
  `sha256:${Buffer.from(ref).toString('hex').padEnd(64, '0').slice(0, 64)}`;

/**
 * The files of one commit, as `sv deploy` would unpack them for `sv apply`, and an empty state directory: a suite with the changes
 * a test asks for, its lock, secrets encrypted to the operator and the server, and any overrides.
 */
export async function makeSource(
  options: {
    suite?: Partial<Suite>;
    secrets?: Record<string, Record<string, string>>;
    overrides?: Record<string, string>;
    /** Writes the server’s age key into the state directory, as `sv server bootstrap` does. */
    serverKey?: boolean;
    lockFrom?: Suite;
    /** How a ref becomes a digest. The default makes one up from the ref. */
    resolve?: (ref: string) => Promise<string>;
  } = {},
): Promise<Source> {
  const base = mkdtempSync(path.join(os.tmpdir(), 'sv-source-'));
  const dir = path.join(base, 'commit');
  const stateDir = path.join(base, 'state');
  mkdirSync(dir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  const operatorIdentity = await generateX25519Identity();
  const serverIdentity = await generateX25519Identity();
  const operator = {
    identity: operatorIdentity,
    recipient: await identityToRecipient(operatorIdentity),
  };
  const server = { identity: serverIdentity, recipient: await identityToRecipient(serverIdentity) };
  const suite: Suite = {
    schema: 1,
    domain: 'sovereign.local',
    core: { version: '0.71.0' },
    database: { version: '18' },
    server: { host: '203.0.113.7', deploy: 'ssh' },
    tls: { mode: 'per-host', email: 'op@sovereign.local' },
    secrets: { recipients: [operator.recipient, server.recipient] },
    ...options.suite,
  };
  writeFileSync(path.join(dir, 'suite.yml'), new Document(suite).toString());
  const lock = await refreshedLock(
    options.lockFrom ?? suite,
    undefined,
    options.resolve ?? (async (ref) => digestOf(ref)),
  );
  writeFileSync(path.join(dir, 'suite.lock'), new Document(lock).toString());
  if (options.secrets) {
    const encrypted: Record<string, Record<string, string>> = {};
    for (const [owner, names] of Object.entries(options.secrets)) {
      encrypted[owner] = {};
      for (const [name, value] of Object.entries(names)) {
        (encrypted[owner] as Record<string, string>)[name] = await encryptValue(
          value,
          suite.secrets.recipients,
        );
      }
    }
    writeFileSync(path.join(dir, 'secrets.age.yml'), new Document(encrypted).toString());
  }
  for (const [file, text] of Object.entries(options.overrides ?? {})) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  if (options.serverKey) {
    writeFileSync(
      path.join(stateDir, 'age.key'),
      `# public key: ${server.recipient}\n${server.identity}\n`,
      { mode: 0o600 },
    );
  }
  return { dir, stateDir, operator, server, suite };
}
