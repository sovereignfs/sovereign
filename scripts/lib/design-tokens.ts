import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface Violation {
  file: string;
  line: number;
  message: string;
}

export interface TokenCheckResult {
  violations: Violation[];
  /** How many distinct tokens the design system and the apps define. */
  definedTokens: number;
}

// Tokens that are never declared in CSS: they are only ever set at runtime with
// element.style.setProperty() or an inline style. Keep this minimal; it is an
// escape hatch, not a place to silence real drift.
const TOKEN_ALLOWLIST: ReadonlySet<string> = new Set([
  // Set by the shell on resize/orientation change: a JS-computed viewport height
  // (mobile browser chrome workaround), never a CSS literal.
  '--sv-vh',
  // Set while the offline banner is visible, so the content can reserve space
  // below it: a JS-computed value, never a CSS literal.
  '--sv-offline-banner-height',
  // Set by CardTileGrid's inline style from its minTileWidth prop.
  '--sv-card-tile-min-width',
  // Set by useSwipeStack on its wrapper during a drag (0-1 per direction) so
  // SwipeStack's stamp overlays react without a re-render per pointermove.
  '--sv-stack-progress-up',
  '--sv-stack-progress-down',
  '--sv-stack-progress-left',
  '--sv-stack-progress-right',
  // The shell's layout state is a second, documented token namespace. The app
  // that owns the shell sets it, not the static design-token contract, and
  // packages/ui components (Dialog, Drawer, PageContainer) read it with an
  // inline fallback so they also work standalone. See docs/design-system.md.
  '--sv-shell-header-height',
  '--sv-shell-footer-height',
  '--sv-shell-sidebar-width',
  '--sv-dialog-inset-top',
  '--sv-dialog-inset-left',
]);

/**
 * Files outside packages/ui/src/tokens that legitimately declare tokens.
 * Dialog sets --sv-page-gutter: an ancestor's signal that a descendant
 * PageContainer must stand down its own padding.
 */
const EXTRA_TOKEN_FILES = ['packages/ui/src/components/Dialog/Dialog.module.css'];

/** `file:line` entries allowed to hardcode a colour. Keep empty unless there is a documented reason. */
const LITERAL_ALLOWLIST: ReadonlySet<string> = new Set();

const SKIPPED_DIRECTORIES = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'storybook-static',
]);

const TOKEN_DEF_RE = /(--sv-[\w-]+)\s*:/g;
const TOKEN_USE_RE = /var\((--sv-[\w-]+)/g;
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /rgba?\(/g;

/** Every file under `dir` (relative to `root`) with one of `extensions`, in a stable order. */
function filesUnder(root: string, dir: string, extensions: readonly string[]): string[] {
  const start = path.join(root, dir);
  if (!existsSync(start)) return [];
  const found: string[] = [];
  const visit = (current: string): void => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      // Never follow a symlink: a loop would recurse forever.
      if (entry.isSymbolicLink() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  visit(start);
  return found;
}

function definedTokens(root: string): Set<string> {
  const files = [
    ...filesUnder(root, 'packages/ui/src/tokens', ['.css']),
    ...EXTRA_TOKEN_FILES.filter((file) => existsSync(path.join(root, file))),
  ];
  const tokens = new Set<string>(TOKEN_ALLOWLIST);
  for (const file of files) {
    const content = readFileSync(path.join(root, file), 'utf8');
    for (const match of content.matchAll(TOKEN_DEF_RE)) {
      if (match[1] !== undefined) tokens.add(match[1]);
    }
  }
  return tokens;
}

function checkUndefinedTokens(root: string, defined: Set<string>): Violation[] {
  const violations: Violation[] = [];
  const files = [
    ...filesUnder(root, 'packages/ui/src', ['.css', '.tsx', '.ts']),
    ...filesUnder(root, 'apps', ['.css', '.tsx', '.ts']),
  ];
  for (const file of files) {
    const lines = readFileSync(path.join(root, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(TOKEN_USE_RE)) {
        const token = match[1];
        if (token !== undefined && !defined.has(token)) {
          violations.push({ file, line: index + 1, message: `undefined token ${token}` });
        }
      }
    });
  }
  return violations;
}

function checkHardcodedLiterals(root: string): Violation[] {
  const violations: Violation[] = [];
  const files = [
    ...filesUnder(root, 'packages/ui/src/components', ['.module.css']),
    ...filesUnder(root, 'apps', ['.module.css']),
  ];
  for (const file of files) {
    const lines = readFileSync(path.join(root, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (LITERAL_ALLOWLIST.has(`${file}:${index + 1}`)) return;
      const hex = line.match(HEX_RE);
      if (hex) {
        violations.push({ file, line: index + 1, message: `hardcoded hex literal: ${hex[0]}` });
      }
      if (RGB_RE.test(line) && !line.includes('var(--sv-')) {
        violations.push({ file, line: index + 1, message: 'hardcoded rgb()/rgba() literal' });
      }
      RGB_RE.lastIndex = 0;
    });
  }
  return violations;
}

/** The Sovereign typeface, exactly as `--sv-font-family` must name it. */
export const FONT_STACK =
  "'Hanken Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const FONT_FAMILY_RE = /(^|[\s;{])font-family\s*:\s*([^;}]+)/g;
const FONT_SHORTHAND_RE = /(^|[\s;{])font\s*:\s*([^;}]+)/g;

/** Strips comments, so a rule written about a declaration is not taken for one. */
const withoutComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/**
 * The typeface is the design system's, whoever uses it: a component or a page names a family only through
 * `var(--sv-font-family…)` (or takes its parent's with `inherit`), never a font of its own, so the one place
 * that says which font Sovereign uses is the token.
 */
function checkFontFamilies(root: string): Violation[] {
  const violations: Violation[] = [];
  const files = [
    ...filesUnder(root, 'packages/ui/src/components', ['.css']),
    ...filesUnder(root, 'apps', ['.css']),
  ];
  for (const file of files) {
    const css = withoutComments(readFileSync(path.join(root, file), 'utf8'));
    for (const match of css.matchAll(FONT_FAMILY_RE)) {
      const value = (match[2] ?? '').trim();
      if (value === 'inherit' || /^var\(--sv-font-family(-mono)?\)$/.test(value)) continue;
      violations.push({
        file,
        line: lineOf(css, match.index + (match[1] ?? '').length),
        message: `font-family must be var(--sv-font-family) or inherit, not ${value}`,
      });
    }
    for (const match of css.matchAll(FONT_SHORTHAND_RE)) {
      const value = (match[2] ?? '').trim();
      if (value === 'inherit') continue;
      violations.push({
        file,
        line: lineOf(css, match.index + (match[1] ?? '').length),
        message: `the font shorthand names a family: use font-size, font-weight and var(--sv-font-family), not ${value}`,
      });
    }
  }
  return violations;
}

/**
 * The token names the Sovereign typeface and the stack the user asked for, in that order, and the design system
 * carries the font: every `@font-face` is for that family, the files it names are there, and `tokens.css` loads
 * them, so using the tokens is using the font.
 */
function checkTypeface(root: string): Violation[] {
  const primitives = 'packages/ui/src/tokens/primitives.css';
  if (!existsSync(path.join(root, primitives))) return [];
  const violations: Violation[] = [];
  const fail = (file: string, line: number, message: string) =>
    violations.push({ file, line, message });

  const tokens = withoutComments(readFileSync(path.join(root, primitives), 'utf8'));
  const declared = /--sv-font-family\s*:\s*([^;]+);/.exec(tokens);
  const stack = declared?.[1]?.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  if (stack !== FONT_STACK) {
    fail(
      primitives,
      lineOf(tokens, declared?.index ?? 0),
      `--sv-font-family must be ${FONT_STACK}`,
    );
  }

  const fonts = 'packages/ui/src/tokens/fonts.css';
  const fontsPath = path.join(root, fonts);
  if (!existsSync(fontsPath)) {
    fail(fonts, 1, 'the design system must carry the typeface: tokens/fonts.css is missing');
    return violations;
  }
  const css = withoutComments(readFileSync(fontsPath, 'utf8'));
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)];
  if (faces.length === 0) fail(fonts, 1, 'tokens/fonts.css declares no @font-face');
  for (const face of faces) {
    const block = face[1] ?? '';
    const line = lineOf(css, face.index);
    const family = /font-family\s*:\s*['"]?([^;'"]+)['"]?/.exec(block)?.[1]?.trim();
    if (family !== 'Hanken Grotesk')
      fail(fonts, line, `@font-face must be for Hanken Grotesk, not ${family}`);
    for (const url of block.matchAll(/url\(\s*['"]?([^)'"]+)['"]?\s*\)/g)) {
      const target = url[1] ?? '';
      if (/^(https?:)?\/\//.test(target)) {
        fail(fonts, line, `the typeface must not come from another site: ${target}`);
      } else if (!existsSync(path.join(path.dirname(fontsPath), target))) {
        fail(fonts, line, `font file is missing: ${target}`);
      }
    }
  }
  const entry = 'packages/ui/src/tokens.css';
  const entryPath = path.join(root, entry);
  if (!existsSync(entryPath) || !readFileSync(entryPath, 'utf8').includes("'./tokens/fonts.css'")) {
    fail(
      entry,
      1,
      "tokens.css must import './tokens/fonts.css', so using the tokens is using the font",
    );
  }
  return violations;
}

/**
 * Every `--sv-*` token a file uses must be defined, and CSS Modules in the design
 * system and the apps must never hardcode a colour that should be a token. The
 * design system is the highest-risk surface (every app inherits whatever ships
 * there), but the apps are where a task under time pressure reaches for a literal
 * instead of adding the missing token or component, so they are checked too.
 */
export function checkDesignTokens(root: string): TokenCheckResult {
  const defined = definedTokens(root);
  return {
    violations: [
      ...checkUndefinedTokens(root, defined),
      ...checkHardcodedLiterals(root),
      ...checkFontFamilies(root),
      ...checkTypeface(root),
    ],
    definedTokens: defined.size,
  };
}
