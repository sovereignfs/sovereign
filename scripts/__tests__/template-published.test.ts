/**
 * A toolkit release once made apps that depended on `@sovereignfs/storage` and a `@sovereignfs/manifest` npm did not have, so every
 * new app failed to install. The release now refuses until each of them is published; this holds the rule.
 */
import { describe, expect, it } from 'vitest';
import { findUnpublished, templateSovereignPackages } from '../lib/template-published';

describe('the app template’s Sovereign packages', () => {
  it('are every @sovereignfs dependency of the template, development ones included', () => {
    const names = templateSovereignPackages().map(({ name }) => name);
    expect(names).toContain('@sovereignfs/manifest');
    expect(names).toContain('@sovereignfs/storage');
    expect(names.every((name) => name.startsWith('@sovereignfs/'))).toBe(true);
    expect(names).not.toContain('next');
  });

  it('are refused when one has no published version in its range', async () => {
    const published: Record<string, string> = {
      '@sovereignfs/a': '1.2.0',
    };
    const missing = await findUnpublished(
      async (name) => published[name],
      [
        { name: '@sovereignfs/a', range: '^1.0.0' },
        { name: '@sovereignfs/b', range: '^0.1.0' },
      ],
    );
    expect(missing).toEqual([{ name: '@sovereignfs/b', range: '^0.1.0' }]);
  });

  it('pass when every one is published', async () => {
    expect(await findUnpublished(async () => '9.9.9')).toEqual([]);
  });
});
