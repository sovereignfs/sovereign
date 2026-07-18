/**
 * design-tokens-check — verifies every `--sv-*` token reference resolves to a
 * real definition, and that `packages/ui` components never hardcode a colour
 * literal that should be a token.
 *
 * Two checks:
 *   1. Undefined tokens — scans `var(--sv-...)` usages across `packages/ui/src`,
 *      `runtime/app`, and `plugins/<id>/app` against the tokens actually defined in
 *      `packages/ui/src/tokens/{primitives,semantic}.css`. An undefined token is
 *      a silent bug: it resolves to nothing in the browser (or the fallback, if
 *      one is given), so the drift is invisible until someone reads the
 *      rendered page pixel-by-pixel.
 *   2. Hardcoded colour literals — scans `packages/ui/src/components` (the public
 *      contract), `runtime/app`, and `plugins/<id>/app` for hex/`rgb()`/`rgba()`
 *      literals outside `var(--sv-...)`. `packages/ui` is the highest-risk
 *      surface (third-party plugins inherit whatever ships there), but the
 *      shell and first-party plugins are exactly where a task under time
 *      pressure reaches for a literal instead of adding the missing token or
 *      component to the design system — so they're checked too.
 *
 * Only tracked files are scanned (`git ls-files`), so gitignored build
 * artifacts (the composed plugin copies under
 * `runtime/app/(platform)/(plugins)/`) are never checked — they're
 * regenerated from `plugins/<id>/app` source, which IS checked.
 *
 * Run via `pnpm design:tokens:check`. Runs in CI after typecheck.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Tokens that are never declared in CSS — only ever set at runtime via
// element.style.setProperty(). Keep this minimal; it's an escape hatch, not a
// place to silence real drift.
const TOKEN_ALLOWLIST: ReadonlySet<string> = new Set([
  // Set by ClientShell.tsx on resize/orientation change — a JS-computed
  // viewport height (mobile browser chrome workaround), never a CSS literal.
  '--sv-vh',
]);

// file:line entries permitted to hardcode a colour literal in the scanned dirs
// (packages/ui/src/components, runtime/app, plugins/*/app). Keep empty unless
// there's a documented reason (e.g. a third-party brand mark that must render
// in its official colour regardless of theme).
const LITERAL_ALLOWLIST: ReadonlySet<string> = new Set();

const TOKEN_DEF_RE = /(--sv-[\w-]+)\s*:/g;
const TOKEN_USE_RE = /var\((--sv-[\w-]+)/g;
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /rgba?\(/g;

function gitFiles(prefix: string, extensions: string[]): string[] {
  const out = execFileSync('git', ['ls-files', prefix], { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => extensions.some((ext) => f.endsWith(ext)));
}

function definedTokens(): Set<string> {
  const files = [
    join(ROOT, 'packages/ui/src/tokens/primitives.css'),
    join(ROOT, 'packages/ui/src/tokens/semantic.css'),
    // Runtime-shell layout state (--sv-shell-*, --sv-dialog-inset-*) is a
    // second, documented token namespace — set by the shell (shell.module.css,
    // globals.css) rather than the static design-token contract, and consumed
    // by packages/ui components (Dialog/Drawer) with an inline fallback for
    // standalone use. See docs/design-system.md "--sv-dialog-inset-top".
    join(ROOT, 'runtime/app/globals.css'),
    join(ROOT, 'runtime/app/(platform)/shell.module.css'),
  ];
  const tokens = new Set<string>(TOKEN_ALLOWLIST);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(TOKEN_DEF_RE)) tokens.add(match[1]);
  }
  return tokens;
}

interface Violation {
  file: string;
  line: number;
  message: string;
}

function checkUndefinedTokens(defined: Set<string>): Violation[] {
  const violations: Violation[] = [];
  const files = [
    ...gitFiles('packages/ui/src', ['.css', '.tsx', '.ts']),
    ...gitFiles('runtime/app', ['.css', '.tsx', '.ts']),
    ...gitFiles('plugins/*/app', ['.css', '.tsx', '.ts']),
  ];
  for (const file of files) {
    const content = readFileSync(join(ROOT, file), 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      for (const match of line.matchAll(TOKEN_USE_RE)) {
        const token = match[1];
        if (!defined.has(token) && !TOKEN_ALLOWLIST.has(token)) {
          violations.push({
            file,
            line: idx + 1,
            message: `undefined token ${token}`,
          });
        }
      }
    });
  }
  return violations;
}

function checkHardcodedLiterals(): Violation[] {
  const violations: Violation[] = [];
  const files = [
    ...gitFiles('packages/ui/src/components', ['.module.css']),
    ...gitFiles('runtime/app', ['.module.css']),
    ...gitFiles('plugins/*/app', ['.module.css']),
  ];
  for (const file of files) {
    const content = readFileSync(join(ROOT, file), 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const key = `${file}:${idx + 1}`;
      if (LITERAL_ALLOWLIST.has(key)) return;
      const hexHits = line.match(HEX_RE);
      const rgbHits = line.match(RGB_RE);
      if (hexHits) {
        violations.push({ file, line: idx + 1, message: `hardcoded hex literal: ${hexHits[0]}` });
      }
      if (rgbHits && !line.includes('var(--sv-')) {
        violations.push({ file, line: idx + 1, message: 'hardcoded rgb()/rgba() literal' });
      }
    });
  }
  return violations;
}

const defined = definedTokens();
const violations = [...checkUndefinedTokens(defined), ...checkHardcodedLiterals()];

if (violations.length > 0) {
  console.error(`\n[design-tokens-check] ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ${v.file}:${v.line} — ${v.message}`);
  console.error('');
  process.exit(1);
}

console.log(`[design-tokens-check] OK — ${defined.size} tokens defined, no violations found.`);
