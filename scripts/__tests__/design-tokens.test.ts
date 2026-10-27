import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDesignTokens } from '../lib/design-tokens';

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
