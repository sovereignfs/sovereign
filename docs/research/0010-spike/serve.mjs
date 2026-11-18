/**
 * The device spike of research 0010 (task 11.8): two installable sites on two origins, a "hub" playing an installed
 * core and a "target" playing an installed app, so what each browser does with a link from one to the other can be
 * seen rather than assumed. Throwaway: no dependency, nothing of Sovereign, never in an image (`docs/` is not copied).
 *
 *   node docs/research/0010-spike/serve.mjs
 *     hub on http://localhost:4101, target on http://localhost:4102 (localhost is a secure context, so both install)
 *
 *   HUB_ORIGIN=https://hub.example.org TARGET_ORIGIN=https://target.example.org node docs/research/0010-spike/serve.mjs
 *     behind a TLS proxy that sends each host to its port (HUB_PORT, TARGET_PORT), for real phones
 *
 * Install both, open the hub from its icon, and tap each link. The target lists every time it was opened: the link
 * that opened it, whether it was in its own installed window, and whether `launchQueue` handed it the address.
 */
import { createServer } from 'node:http';

const HUB_PORT = Number(process.env.HUB_PORT ?? 4101);
const TARGET_PORT = Number(process.env.TARGET_PORT ?? 4102);
const HUB = process.env.HUB_ORIGIN ?? `http://localhost:${HUB_PORT}`;
const TARGET = process.env.TARGET_ORIGIN ?? `http://localhost:${TARGET_PORT}`;

const icon = (fill, letter) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${fill}"/><text x="256" y="340" font-size="280" font-family="sans-serif" text-anchor="middle" fill="#fff">${letter}</text></svg>`;

const manifest = (name, extra) =>
  JSON.stringify({
    id: '/',
    name,
    short_name: name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    ...extra,
  });

// A worker that passes everything through: some browsers still want one before they offer to install.
const WORKER = "self.addEventListener('fetch', () => {});";

const shell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${title}">
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon.png"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:max(1rem,env(safe-area-inset-top)) 1rem 2rem}
a,button{display:block;width:100%;box-sizing:border-box;margin:.5rem 0;padding:.8rem;border:1px solid #888;border-radius:.5rem;
background:#f4f4f5;color:#111;font:inherit;text-align:left;text-decoration:none}code{font-size:.85em}li{margin:.3rem 0}</style>
</head><body>${body}<script>
const mode = ['standalone','minimal-ui','fullscreen','window-controls-overlay','browser'].find((m) => matchMedia('(display-mode: ' + m + ')').matches) + (navigator.standalone ? ' (iOS standalone)' : '');
document.getElementById('mode').textContent = mode;
navigator.serviceWorker?.register('/sw.js').catch(() => {});
</script></body></html>`;

const HUB_PAGE = shell(
  'Spike hub',
  `<h1>Hub</h1><p>Display mode: <b id="mode"></b></p><p>Each link opens the target app at <code>${TARGET}/?via=…</code>.</p>
<a id="same" href="${TARGET}/?via=same-tab">1. Same tab (what core's tiles do today)</a>
<a id="blank" href="${TARGET}/?via=target-blank" target="_blank" rel="noopener">2. target="_blank" rel="noopener"</a>
<button id="open" type="button">3. window.open(url, '_blank', 'noopener')</button>
<button id="click-time" type="button">4. Decided at click time (RFC 0001 A5): installed → new window, tab → same tab</button>
<a id="intent" href="intent://${TARGET.replace(/^https?:\/\//, '')}/?via=intent#Intent;scheme=${TARGET.startsWith('https') ? 'https' : 'http'};S.browser_fallback_url=${encodeURIComponent(`${TARGET}/?via=intent-fallback`)};end">5. Android intent: address</a>
<script>
const url = (via) => '${TARGET}/?via=' + via;
document.getElementById('open').onclick = () => window.open(url('window-open'), '_blank', 'noopener');
document.getElementById('click-time').onclick = () => {
  const installed = ['standalone','minimal-ui','fullscreen','window-controls-overlay'].some((m) => matchMedia('(display-mode: ' + m + ')').matches) || navigator.standalone === true;
  if (installed) window.open(url('click-time-installed'), '_blank', 'noopener');
  else location.assign(url('click-time-tab'));
};
// For a scripted run: \`?auto=blank\` clicks that link once the page is up (a browser must allow pop-ups for it).
const auto = new URLSearchParams(location.search).get('auto');
if (auto) setTimeout(() => document.getElementById(auto)?.click(), 800);
</script>`,
);

const TARGET_PAGE = shell(
  'Spike target',
  `<h1>Target app</h1><p>Display mode now: <b id="mode"></b></p><p>Opened (newest first):</p><ol id="log"></ol>
<button id="clear" type="button">Clear the list</button>
<script>
const KEY = 'spike-opened';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
const draw = () => { document.getElementById('log').innerHTML = read().map((e) => '<li><b>' + e.via + '</b> · ' + e.mode + ' · ' + e.how + ' · ' + e.at + '</li>').join(''); };
const record = (address, how) => {
  const via = new URL(address).searchParams.get('via') || '(icon or start)';
  const m = ['standalone','minimal-ui','fullscreen','window-controls-overlay','browser'].find((x) => matchMedia('(display-mode: ' + x + ')').matches) + (navigator.standalone ? ' (iOS)' : '');
  write([{ via, mode: m, how, at: new Date().toLocaleTimeString() }, ...read()].slice(0, 30));
  draw();
  // Told to the spike server too, so a run can be read where nobody can see the screen.
  fetch('/log', { method: 'POST', body: JSON.stringify({ via, mode: m, how }) }).catch(() => {});
};
record(location.href, 'page load' + (window.opener ? ', has opener' : ''));
if ('launchQueue' in window) window.launchQueue.setConsumer((params) => params.targetURL && record(params.targetURL, 'launchQueue'));
document.getElementById('clear').onclick = () => { write([]); draw(); };
</script>`,
);

function serve(port, page, manifestBody, letter, fill) {
  createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    const send = (type, body) => {
      response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      response.end(body);
    };
    if (path === '/manifest.webmanifest') return send('application/manifest+json', manifestBody);
    if (path === '/sw.js') return send('text/javascript', WORKER);
    if (path === '/icon.svg' || path === '/icon.png')
      return send('image/svg+xml', icon(fill, letter));
    if (path === '/') return send('text/html; charset=utf-8', page);
    if (path === '/log' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        console.log(`opened ${body} ua=${request.headers['user-agent']?.slice(0, 60)}`);
        response.writeHead(204).end();
      });
      return;
    }
    response.writeHead(404).end();
  }).listen(port, () =>
    console.log(`${letter === 'H' ? 'hub   ' : 'target'} http://localhost:${port}`),
  );
}

serve(
  HUB_PORT,
  HUB_PAGE,
  manifest('Spike hub', { launch_handler: { client_mode: ['focus-existing', 'auto'] } }),
  'H',
  '#1d4ed8',
);
serve(
  TARGET_PORT,
  TARGET_PAGE,
  manifest('Spike target', {
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    handle_links: 'preferred',
  }),
  'T',
  '#15803d',
);
console.log(`hub links to ${TARGET}; open ${HUB} and install both`);
