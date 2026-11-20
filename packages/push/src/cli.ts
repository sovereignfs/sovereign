#!/usr/bin/env node
/**
 * `npx @sovereignfs/push keys`: a new key for an app run without an instance (a hosted app's is made by the instance, from its
 * manifest's `generate`). It prints the private key, for `<PREFIX>_VAPID_PRIVATE_KEY`, and the public key that follows from it.
 */
import { generatePushKeys } from './keys.js';

const [command] = process.argv.slice(2);

if (command === 'keys') {
  const { privateKey, publicKey } = generatePushKeys();
  process.stdout.write(
    `Private key (set it as <PREFIX>_VAPID_PRIVATE_KEY and keep it secret):\n${privateKey}\n\n` +
      `Public key (derived from it; nothing needs to be set):\n${publicKey}\n`,
  );
} else {
  process.stderr.write(
    'Usage: npx @sovereignfs/push keys\n  Prints a new Web Push key for <PREFIX>_VAPID_PRIVATE_KEY.\n',
  );
  process.exitCode = command === undefined || command === '--help' ? 0 : 1;
}
