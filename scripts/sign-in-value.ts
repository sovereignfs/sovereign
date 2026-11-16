/**
 * Prints the sign-in value a browser would send for a password and an address to the core at a URL (core-app §5.2), reading the
 * instance id from its instance document. For scripts that sign in to a running core outside a browser, such as the Docker smoke
 * test: `tsx scripts/sign-in-value.ts URL EMAIL PASSWORD`.
 */
import { derivePassword, fromBase64Url } from '../packages/crypto/src/web/index.js';

const [url, email, password] = process.argv.slice(2);
if (!url || !email || !password) {
  console.error('Usage: tsx scripts/sign-in-value.ts URL EMAIL PASSWORD');
  process.exit(2);
}
const document = (await (await fetch(`${url}/.well-known/sovereign-instance`)).json()) as {
  instanceId?: string;
};
const instanceId = fromBase64Url(document.instanceId ?? '');
if (instanceId?.length !== 32) {
  console.error(`${url} publishes no instance id.`);
  process.exit(1);
}
console.log((await derivePassword({ password, address: email, instanceId })).signIn);
