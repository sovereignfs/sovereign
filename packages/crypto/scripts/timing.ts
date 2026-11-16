/**
 * Serves the timing page to a phone on the same network: `pnpm --filter @sovereignfs/crypto timing [--port 4545]`. It bundles
 * `timing/page.ts` with the package's own Argon2id and prints the addresses to open. A development tool: nothing here is in the
 * built package.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'tsup';

const at = (path: string) => fileURLToPath(new URL(`../timing/${path}`, import.meta.url));
const portFlag = process.argv.indexOf('--port');
const port = portFlag === -1 ? 4545 : Number(process.argv[portFlag + 1]);

await build({
  entry: { page: at('page.ts') },
  outDir: at('dist'),
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  noExternal: [/.*/],
  // One file: libsodium is loaded on demand, which would otherwise be a chunk of its own.
  splitting: false,
  dts: false,
  clean: true,
  silent: true,
  config: false,
});

const files: Record<string, [string, string]> = {
  '/': [at('index.html'), 'text/html; charset=utf-8'],
  '/page.js': [at('dist/page.js'), 'text/javascript; charset=utf-8'],
};

createServer((request, response) => {
  const file = files[request.url ?? ''];
  if (!file) {
    response.writeHead(request.url === '/favicon.ico' ? 204 : 404).end();
    return;
  }
  response
    .writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' })
    .end(readFileSync(file[0]));
}).listen(port, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry?.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry?.address}:${port}/`);
  console.log(`The timing page is at http://localhost:${port}/`);
  for (const address of addresses) console.log(`On a phone on the same network: ${address}`);
  console.log('Stop with Ctrl-C.');
});
