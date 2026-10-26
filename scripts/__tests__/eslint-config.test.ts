/**
 * Two things in the ESLint config are load-bearing, and a lint rule nobody has
 * seen fail proves nothing. This runs the repository's real config over small
 * snippets and checks that:
 *
 * - a shared package importing the core app is rejected, while the same import
 *   in the app itself is not; and
 * - the jsx-a11y rules still fire. eslint-plugin-jsx-a11y declares support only
 *   up to ESLint 9 and runs here on ESLint 10 through an explicit peer
 *   allowance (pnpm-workspace.yaml), so a future ESLint bump that silently stops
 *   its rules must fail a test instead of going unnoticed.
 */
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function messages(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`);
}

describe('shared packages must not import the core app', () => {
  const imports = [
    "import x from '../../../apps/core/src/x';",
    "import x from '@sovereignfs/core';",
    "import x from '@sovereignfs/core/auth';",
  ];

  it.each(imports)('rejects %s inside a package', async (statement) => {
    const found = await messages('packages/example/src/a.ts', `${statement}\nexport default x;\n`);
    expect(found.some((m) => m.includes('Shared packages must not import the core app'))).toBe(
      true,
    );
  });

  it('allows the same import inside the core app itself', async () => {
    const found = await messages(
      'apps/core/src/a.ts',
      "import x from '@sovereignfs/core';\nexport default x;\n",
    );
    expect(found.filter((m) => m.includes('Shared packages must not import'))).toEqual([]);
  });

  it('allows a package to import another package', async () => {
    const found = await messages(
      'packages/example/src/a.ts',
      "import x from '@sovereignfs/tsconfig';\nexport default x;\n",
    );
    expect(found.filter((m) => m.includes('Shared packages must not import'))).toEqual([]);
  });
});

describe('accessibility rules still run on the installed ESLint', () => {
  it('flags an image without alt text in a .tsx file', async () => {
    const found = await messages(
      'apps/core/src/a.tsx',
      'export const A = () => <img src="x.png" />;\n',
    );
    expect(found.some((m) => m.startsWith('jsx-a11y/alt-text'))).toBe(true);
  });

  it('flags a click handler on a non-interactive element', async () => {
    const found = await messages(
      'apps/core/src/a.tsx',
      'export const A = () => <div onClick={() => {}} />;\n',
    );
    expect(found.some((m) => m.startsWith('jsx-a11y/click-events-have-key-events'))).toBe(true);
  });

  it('accepts an accessible equivalent', async () => {
    const found = await messages(
      'apps/core/src/a.tsx',
      'export const A = () => <img src="x.png" alt="A logo" />;\n',
    );
    expect(found.filter((m) => m.startsWith('jsx-a11y/'))).toEqual([]);
  });
});
