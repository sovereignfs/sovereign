/**
 * The timing page (`pnpm --filter @sovereignfs/crypto timing`). It times Argon2id alone, through the package's own `argon2id`, so
 * it works over plain http on a local network, where a browser offers no `crypto.subtle`. The rest of a derivation (one SHA-256,
 * two HKDFs) costs well under a millisecond.
 */
import { argon2id, type Argon2Cost } from '../src/web/argon2.js';
import { CHECKS } from './checks.js';
import vectors from '../src/web/__tests__/password-vectors.json' with { type: 'json' };

const MiB = 1024 * 1024;
/** The starting cost, then lower memory before fewer passes, down to the minimum (RFC 0005 §1.4). */
const COSTS: Argon2Cost[] = [
  { memoryBytes: 64 * MiB, passes: 3 },
  { memoryBytes: 48 * MiB, passes: 3 },
  { memoryBytes: 32 * MiB, passes: 3 },
  { memoryBytes: 19 * MiB, passes: 3 },
  { memoryBytes: 19 * MiB, passes: 2 },
];
const RUNS = 3;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hexToBytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const pause = () => new Promise((resolve) => setTimeout(resolve, 50));

/**
 * Checks libsodium against the cheap vector only (1 MiB): the full-cost vectors need 64 MiB, and a phone that cannot give it must
 * still reach the timing, where that failure is a result to report.
 */
async function check(): Promise<boolean> {
  for (const vector of vectors.filter((item) => item.input.derivation.memoryBytes <= 1024 * 1024)) {
    const password = new TextEncoder().encode(vector.input.password.normalize('NFKC'));
    const secret = await argon2id(
      password,
      hexToBytes(vector.output.salt),
      vector.input.derivation,
    );
    if (toHex(secret) !== vector.output.secret) return false;
  }
  return true;
}

function describeDevice(): string {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return [
    `Device: ${navigator.userAgent}`,
    `Cores: ${navigator.hardwareConcurrency ?? 'unknown'}`,
    `Memory: ${nav.deviceMemory === undefined ? 'unknown' : `${nav.deviceMemory} GB (as the browser rounds it)`}`,
  ].join('\n');
}

async function run(): Promise<void> {
  const button = element<HTMLButtonElement>('run');
  const rows = element<HTMLTableSectionElement>('rows');
  button.disabled = true;
  rows.replaceChildren();
  const lines = [describeDevice(), '', 'memory  passes  median  slowest'];
  const password = new TextEncoder().encode('a password of ordinary length');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  for (const cost of COSTS) {
    const row = rows.insertRow();
    row.insertCell().textContent = `${cost.memoryBytes / MiB} MiB`;
    row.insertCell().textContent = String(cost.passes);
    const median = row.insertCell();
    const slowest = row.insertCell();
    median.className = slowest.className = 'n';
    median.textContent = '…';
    const times: number[] = [];
    try {
      for (let i = 0; i < RUNS; i += 1) {
        await pause();
        const start = performance.now();
        await argon2id(password, salt, cost);
        times.push(performance.now() - start);
      }
    } catch (error) {
      // Most likely the memory: a phone that cannot give this much fails here, which is a result in itself.
      median.textContent = slowest.textContent = 'failed';
      lines.push(`${cost.memoryBytes / MiB} MiB  ${cost.passes}  failed: ${String(error)}`);
      continue;
    }
    times.sort((a, b) => a - b);
    const [mid, max] = [times[1] ?? 0, times[RUNS - 1] ?? 0].map((ms) => `${Math.round(ms)} ms`);
    median.textContent = mid ?? '';
    slowest.textContent = max ?? '';
    lines.push(`${cost.memoryBytes / MiB} MiB  ${cost.passes}  ${mid}  ${max}`);
  }
  element('report').textContent = lines.join('\n');
  button.disabled = false;
}

const status = element('check');
check().then(
  (agrees) => {
    status.textContent = agrees
      ? 'libsodium agrees with the vectors in this browser.'
      : 'libsodium does NOT agree with the vectors in this browser. Do not use these timings; report it.';
    status.className = agrees ? 'ok' : 'bad';
    const button = element<HTMLButtonElement>('run');
    button.disabled = !agrees;
    button.addEventListener('click', () => void run());
  },
  (error: unknown) => {
    status.textContent = `libsodium did not load: ${String(error)}`;
    status.className = 'bad';
  },
);

/** The browser checks, where a secure context gives `crypto.subtle`. */
async function runChecks(): Promise<void> {
  const list = element<HTMLUListElement>('checks');
  if (!globalThis.isSecureContext || !crypto.subtle) {
    list.innerHTML =
      '<li>Needs a secure context: open this page on localhost, or over https. The timing above does not need one.</li>';
    return;
  }
  list.replaceChildren();
  for (const [name, check] of CHECKS) {
    const item = document.createElement('li');
    item.textContent = `${name}: …`;
    list.append(item);
    const held = await check().catch(() => false);
    item.textContent = `${name}: ${held ? 'holds' : 'FAILS'}`;
    item.className = held ? 'ok' : 'bad';
  }
}

void runChecks();
