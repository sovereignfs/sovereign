import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type Finding = {
  file: string;
  line: number;
  target: string;
  reason: string;
};

/**
 * Link targets that are documented before the file exists, with the roadmap
 * task that creates each. A planned target is accepted only while it is
 * missing - once the file exists it is checked like any other link - and the
 * entry is deleted by the task that creates it.
 */
export const PLANNED_TARGETS: Record<string, string> = {
  'spec/core-api': 'task 10.1',
};

/** Directories never scanned: dependencies, build output, and imported packages. */
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'data',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Never follow a symlink: a loop would recurse forever, and a link out of
    // the repository would make this read documents that are not ours.
    if (entry.isSymbolicLink()) continue;
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.md')) yield full;
  }
}

/** Strips fenced code blocks and inline code so example links are not checked. */
function maskCode(source: string): string {
  const lines = source.split('\n');
  let fence: string | null = null;
  return lines
    .map((line) => {
      const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
      if (fence) {
        if (marker && marker.startsWith(fence[0] ?? '') && marker.length >= fence.length) {
          fence = null;
        }
        return '';
      }
      if (marker) {
        fence = marker;
        return '';
      }
      return line.replace(/`[^`\n]*`/g, (code) => ' '.repeat(code.length));
    })
    .join('\n');
}

/**
 * The link pattern backtracks, so a line of tens of thousands of `[` takes
 * quadratic time. No real document line is this long; one that is gets reported
 * instead of checked, so it can never stall CI.
 */
const MAX_LINE_LENGTH = 10_000;

const LINK = /!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

/** `decodeURI` throws on a malformed escape; a stray `%` is then just a `%`. */
function decode(target: string): string {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}

export function checkDocLinks(
  root: string,
  planned: Record<string, string> = PLANNED_TARGETS,
): Finding[] {
  const findings: Finding[] = [];
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const masked = maskCode(readFileSync(file, 'utf8'));
    masked.split('\n').forEach((line, index) => {
      if (line.length > MAX_LINE_LENGTH) {
        findings.push({
          file: rel,
          line: index + 1,
          target: '',
          reason: `the line is too long to check (over ${MAX_LINE_LENGTH} characters)`,
        });
        return;
      }
      for (const match of line.matchAll(LINK)) {
        const raw = match[1];
        if (!raw || isExternal(raw) || raw.startsWith('#')) continue;
        const target = decode(raw.split('#')[0] ?? '');
        if (!target) continue;
        // A leading slash means "from the repository root", as on GitHub - never
        // the host filesystem root.
        const resolved = target.startsWith('/')
          ? path.join(root, target)
          : path.resolve(path.dirname(file), target);
        const fromRoot = path.relative(root, resolved).split(path.sep).join('/').replace(/\/$/, '');
        // Existence outside the repository proves nothing about the repository:
        // `../../../../etc/hosts` exists on the CI machine.
        if (fromRoot === '..' || fromRoot.startsWith('../') || path.isAbsolute(fromRoot)) {
          findings.push({
            file: rel,
            line: index + 1,
            target: raw,
            reason: 'the link points outside the repository',
          });
          continue;
        }
        if (existsSync(resolved)) continue;
        if (planned[fromRoot]) continue;
        findings.push({
          file: rel,
          line: index + 1,
          target: raw,
          reason: 'the linked file or directory does not exist',
        });
      }
    });
  }
  return findings;
}
