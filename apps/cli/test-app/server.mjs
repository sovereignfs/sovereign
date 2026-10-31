// A small app that meets spec/app-manifest.md, for `sv apply` to host in its tests: it listens on one port, answers its health path,
// and says what it was given, so a test can see that its environment and secrets reached it. It is not an example of how to write an app.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);
const prefix = 'TESTAPP';

function given() {
  const out = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith(`${prefix}_`)) continue;
    if (name.endsWith('_FILE')) {
      let length = null;
      try {
        length = readFileSync(value, 'utf8').length;
      } catch {
        // Unreadable by this user: a test fails on it.
      }
      out[name] = { file: value, length };
    } else {
      out[name] = value;
    }
  }
  return out;
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  } else if (url.pathname === '/env') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ env: given(), user: process.getuid?.() }));
  } else if (url.pathname === '/fetch') {
    // What this app can reach: used to show that it reaches its peers' public names and nothing else.
    try {
      const reply = await fetch(url.searchParams.get('url') ?? '', {
        signal: AbortSignal.timeout(8000),
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: reply.status }));
    } catch (error) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: String(error.cause?.code ?? error.message) }));
    }
  } else {
    response.writeHead(404);
    response.end();
  }
}).listen(port, '0.0.0.0');

process.on('SIGTERM', () => process.exit(0));
