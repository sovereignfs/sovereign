import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Real regression coverage for the SDK boundary rule (NFR-06,
 * eslint.config.ts) — not a snapshot of the config, an actual lint run
 * against fixture source text, asserting the rule rejects what it claims to
 * reject and permits what it claims to permit. Uses the project's real flat
 * config (`overrideConfigFile` defaults to it), so a change to
 * eslint.config.ts that silently weakens the boundary fails this test, not
 * just a manual `pnpm lint` run someone forgets to do.
 *
 * `lintText` with a `filePath` matches flat config `files`/`ignores` globs
 * against that path without needing a real file on disk.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId).filter((id): id is string => id !== null);
}

describe('plugin SDK boundary — a forbidden import is actually rejected', () => {
  it('rejects a third-party plugin importing @sovereignfs/db directly', async () => {
    const ids = await ruleIds(
      `import { getPlatformDb } from '@sovereignfs/db';\nexport { getPlatformDb };\n`,
      'plugins/example-widget/app/actions.ts',
    );
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('rejects a third-party plugin importing runtime/src via a literal relative path', async () => {
    const ids = await ruleIds(
      `import { getInstalledPlugins } from '../../../runtime/src/registry';\nexport { getInstalledPlugins };\n`,
      'plugins/example-widget/app/actions.ts',
    );
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('rejects a third-party plugin reaching runtime/src via the @/ alias — the gap this leg closed', async () => {
    const ids = await ruleIds(
      `import { getPlatformDb } from '@/src/db';\nexport { getPlatformDb };\n`,
      'plugins/example-widget/app/actions.ts',
    );
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('rejects @sovereignfs/manifest and @sovereignfs/mailer the same way as @sovereignfs/db', async () => {
    const manifestIds = await ruleIds(
      `import { validateManifest } from '@sovereignfs/manifest';\nexport { validateManifest };\n`,
      'plugins/example-widget/app/actions.ts',
    );
    expect(manifestIds).toContain('@typescript-eslint/no-restricted-imports');

    const mailerIds = await ruleIds(
      `import { sendMail } from '@sovereignfs/mailer';\nexport { sendMail };\n`,
      'plugins/example-widget/app/actions.ts',
    );
    expect(mailerIds).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('applies the same boundary to example-plugins/, not just plugins/', async () => {
    const ids = await ruleIds(
      `import { getPlatformDb } from '@sovereignfs/db';\nexport { getPlatformDb };\n`,
      'example-plugins/example-basic/app/actions.ts',
    );
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('permits the documented @sovereignfs/sdk and @sovereignfs/ui imports', async () => {
    const ids = await ruleIds(
      `import { sdk } from '@sovereignfs/sdk';\nimport { Button } from '@sovereignfs/ui';\nexport { sdk, Button };\n`,
      'plugins/example-widget/app/actions.ts',
    );
    expect(ids).not.toContain('@typescript-eslint/no-restricted-imports');
  });
});

describe("plugin SDK boundary — plugins/console's narrower, documented exception", () => {
  it('permits Console to reach runtime/src via the @/ alias', async () => {
    const ids = await ruleIds(
      `import { getInstalledPlugins } from '@/src/registry';\nexport { getInstalledPlugins };\n`,
      'plugins/console/app/users/actions.ts',
    );
    expect(ids).not.toContain('@typescript-eslint/no-restricted-imports');
  });

  it('still rejects Console importing @sovereignfs/db directly — the exception is scoped, not a free pass', async () => {
    const ids = await ruleIds(
      `import { getPlatformDb } from '@sovereignfs/db';\nexport { getPlatformDb };\n`,
      'plugins/console/app/users/actions.ts',
    );
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('still rejects Console importing @sovereignfs/mailer directly', async () => {
    const ids = await ruleIds(
      `import { sendMail } from '@sovereignfs/mailer';\nexport { sendMail };\n`,
      'plugins/console/app/settings/actions.ts',
    );
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('does not extend the exception to Launcher or Account — only Console is carved out', async () => {
    const launcherIds = await ruleIds(
      `import { getPlatformDb } from '@/src/db';\nexport { getPlatformDb };\n`,
      'plugins/launcher/app/_components/PluginTile.tsx',
    );
    expect(launcherIds).toContain('@typescript-eslint/no-restricted-imports');

    const accountIds = await ruleIds(
      `import { getPlatformDb } from '@/src/db';\nexport { getPlatformDb };\n`,
      'plugins/account/app/actions.ts',
    );
    expect(accountIds).toContain('@typescript-eslint/no-restricted-imports');
  });
});
