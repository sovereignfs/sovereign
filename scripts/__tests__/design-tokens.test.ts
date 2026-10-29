import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDesignTokens, FONT_STACK } from '../lib/design-tokens';

let root: string;

function write(file: string, content: string): void {
  const full = path.join(root, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'design-tokens-'));
  write('packages/ui/src/tokens/semantic.css', ':root { --sv-color-text: #111; }\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('checkDesignTokens', () => {
  it('passes when every token used is defined and no colour is hardcoded', () => {
    write('packages/ui/src/components/A/A.module.css', '.a { color: var(--sv-color-text); }\n');
    const result = checkDesignTokens(root);
    expect(result.violations).toEqual([]);
    expect(result.definedTokens).toBeGreaterThan(0);
  });

  it('fails on a token that is used but not defined, naming file and line', () => {
    write(
      'packages/ui/src/components/A/A.module.css',
      '.a {\n  color: var(--sv-color-missing);\n}\n',
    );
    expect(checkDesignTokens(root).violations).toEqual([
      {
        file: 'packages/ui/src/components/A/A.module.css',
        line: 2,
        message: 'undefined token --sv-color-missing',
      },
    ]);
  });

  it('fails on a hardcoded hex colour in a CSS Module', () => {
    write('packages/ui/src/components/A/A.module.css', '.a {\n  color: #ff0000;\n}\n');
    expect(checkDesignTokens(root).violations).toEqual([
      expect.objectContaining({ line: 2, message: 'hardcoded hex literal: #ff0000' }),
    ]);
  });

  it('fails on a hardcoded rgb() or rgba() colour, on every such line', () => {
    write(
      'packages/ui/src/components/A/A.module.css',
      '.a { color: rgb(0 0 0); }\n.b { color: rgba(0, 0, 0, 0.5); }\n',
    );
    expect(checkDesignTokens(root).violations.map((v) => [v.line, v.message])).toEqual([
      [1, 'hardcoded rgb()/rgba() literal'],
      [2, 'hardcoded rgb()/rgba() literal'],
    ]);
  });

  it('allows rgba() built on a token', () => {
    write(
      'packages/ui/src/components/A/A.module.css',
      '.a { color: rgba(var(--sv-color-text), 0.5); }\n',
    );
    expect(checkDesignTokens(root).violations).toEqual([]);
  });

  it('checks the apps too', () => {
    write('apps/core/app/page.module.css', '.a { color: #abc; background: var(--sv-nope); }\n');
    expect(checkDesignTokens(root).violations.map((v) => v.file)).toEqual([
      'apps/core/app/page.module.css',
      'apps/core/app/page.module.css',
    ]);
  });

  it('does not scan build output or dependencies', () => {
    write('apps/core/.next/x.module.css', '.a { color: #abc; }\n');
    write('apps/core/node_modules/y/y.module.css', '.a { color: #abc; }\n');
    write('packages/ui/src/components/dist/z.module.css', '.a { color: #abc; }\n');
    expect(checkDesignTokens(root).violations).toEqual([]);
  });

  it('reads a token defined by the allowed extra file', () => {
    write(
      'packages/ui/src/components/Dialog/Dialog.module.css',
      '.d { --sv-page-gutter: 0; }\n.e { padding: var(--sv-page-gutter); }\n',
    );
    expect(checkDesignTokens(root).violations).toEqual([]);
  });

  it('copes with a repository that has no apps yet', () => {
    expect(checkDesignTokens(root).violations).toEqual([]);
  });
});

describe('the typeface', () => {
  const GOOD_FACE =
    "@font-face {\n  font-family: 'Hanken Grotesk';\n  src: url(../fonts/a.woff2) format('woff2');\n}\n";
  const component = 'packages/ui/src/components/A/A.module.css';

  /** A design system that carries the font as it must, for a test to break one part of. */
  const withTypeface = () => {
    write(
      'packages/ui/src/tokens/primitives.css',
      `:root { --sv-font-family: ${FONT_STACK}; --sv-font-family-mono: monospace; }\n`,
    );
    write('packages/ui/src/tokens/fonts.css', GOOD_FACE);
    write('packages/ui/src/fonts/a.woff2', 'font');
    write('packages/ui/src/tokens.css', "@import './tokens/fonts.css';\n");
  };

  it('passes when the token names the stack, and the design system carries and loads the font', () => {
    withTypeface();
    write(component, '.a { font-family: var(--sv-font-family); }\n.b { font-family: inherit; }\n');
    expect(checkDesignTokens(root).violations).toEqual([]);
  });

  it('accepts the stack written with double quotes and over several lines', () => {
    withTypeface();
    write(
      'packages/ui/src/tokens/primitives.css',
      ':root {\n  --sv-font-family:\n    "Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,\n    Helvetica, Arial, sans-serif;\n}\n',
    );
    expect(checkDesignTokens(root).violations).toEqual([]);
  });

  it.each([
    [
      'another font first',
      "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    ],
    ['the fallbacks missing', "'Hanken Grotesk', sans-serif"],
    [
      'the fallbacks out of order',
      "'Hanken Grotesk', system-ui, ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    ],
  ])('fails when the token has %s', (_name, stack) => {
    withTypeface();
    write('packages/ui/src/tokens/primitives.css', `:root { --sv-font-family: ${stack}; }\n`);
    expect(checkDesignTokens(root).violations).toEqual([
      expect.objectContaining({ message: expect.stringContaining('--sv-font-family must be') }),
    ]);
  });

  it('fails when a component names a font of its own, whatever the quotes or the line', () => {
    withTypeface();
    write(component, ".a {\n  font-family: Arial, sans-serif;\n}\n.b { font-family: 'Inter'; }\n");
    expect(checkDesignTokens(root).violations.map((v) => [v.file, v.line])).toEqual([
      [component, 2],
      [component, 4],
    ]);
  });

  it('fails on the font shorthand that names a family, and lets `font: inherit` be', () => {
    withTypeface();
    write(component, '.a { font: 12px Arial; }\n.b { font: inherit; }\n');
    expect(checkDesignTokens(root).violations).toEqual([
      expect.objectContaining({ line: 1, message: expect.stringContaining('font shorthand') }),
    ]);
  });

  it('is not fooled by a comment that mentions a font', () => {
    withTypeface();
    write(component, '/* font-family: Arial */\n.a { font-family: var(--sv-font-family-mono); }\n');
    expect(checkDesignTokens(root).violations).toEqual([]);
  });

  it('checks the apps’ own CSS too', () => {
    withTypeface();
    write('apps/core/app/globals.css', 'body { font-family: Georgia, serif; }\n');
    expect(checkDesignTokens(root).violations).toEqual([
      expect.objectContaining({ file: 'apps/core/app/globals.css', line: 1 }),
    ]);
  });

  it('fails when the design system does not carry the font, or asks another site for it', () => {
    withTypeface();
    write(
      'packages/ui/src/tokens/fonts.css',
      GOOD_FACE.replace('../fonts/a.woff2', 'https://fonts.example/a.woff2'),
    );
    expect(checkDesignTokens(root).violations).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('must not come from another site'),
      }),
    ]);
    write('packages/ui/src/tokens/fonts.css', GOOD_FACE.replace('a.woff2', 'gone.woff2'));
    expect(checkDesignTokens(root).violations).toEqual([
      expect.objectContaining({ message: 'font file is missing: ../fonts/gone.woff2' }),
    ]);
    write('packages/ui/src/tokens/fonts.css', GOOD_FACE.replace('Hanken Grotesk', 'Other'));
    expect(checkDesignTokens(root).violations).toEqual([
      expect.objectContaining({ message: expect.stringContaining('must be for Hanken Grotesk') }),
    ]);
  });

  it('fails when tokens.css does not load the font, so using the tokens would not be using it', () => {
    withTypeface();
    write('packages/ui/src/tokens.css', "@import './tokens/primitives.css';\n");
    expect(checkDesignTokens(root).violations).toEqual([
      expect.objectContaining({ file: 'packages/ui/src/tokens.css' }),
    ]);
  });
});
