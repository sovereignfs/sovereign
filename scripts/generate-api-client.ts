/**
 * Writes `packages/api-client/src/generated/` from the Core API contract (`contracts/core-api/openapi.yaml`).
 *
 * Run: `pnpm generate:api-client`. With `--check` it writes nothing and fails when what is committed is not what
 * the contract produces, which is what CI runs, so the client cannot be edited by hand or left behind.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedFiles } from './lib/api-client-files';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');

let stale = false;
for (const [file, text] of Object.entries(await generatedFiles(root))) {
  const target = path.join(root, file);
  let current: string | undefined;
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    current = undefined;
  }
  if (current === text) continue;
  if (check) {
    stale = true;
    console.error(
      `${file} is not what contracts/core-api/openapi.yaml produces. Run: pnpm generate:api-client`,
    );
  } else {
    writeFileSync(target, text);
    console.log(`wrote ${file}`);
  }
}
if (stale) process.exit(1);
