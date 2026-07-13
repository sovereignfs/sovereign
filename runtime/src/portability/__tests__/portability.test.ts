import { afterEach, describe, expect, it } from 'vitest';
import type { ImportContext, PluginExportSection } from '@sovereignfs/sdk';
import { type PlatformExportData, assembleExport } from '../assemble';
import { PLATFORM_SECTION_ID, readZip, u8ToJson } from '../bundle';
import { clearPortabilityRegistry, registerExporter, registerImporter } from '../registry';
import { type PlatformAccountSection, applyImport } from '../restore';

const PLATFORM: PlatformExportData = {
  name: 'Ada',
  email: 'ada@example.com',
  image: null,
  timezone: 'UTC',
  theme: 'system',
  vaultSecrets: [],
  avatar: { ext: 'png', bytes: new Uint8Array([137, 80, 78, 71]) },
  e2ee: null,
};

function getEntry(files: Record<string, Uint8Array | undefined>, key: string): Uint8Array {
  const v = files[key];
  expect(v, `expected "${key}" in bundle`).toBeDefined();
  return v as Uint8Array;
}

afterEach(() => {
  clearPortabilityRegistry();
});

describe('assembleExport', () => {
  it('writes the platform slice + avatar and a manifest', async () => {
    const zip = await assembleExport({
      userId: 'u1',
      tenantId: 'default',
      platform: PLATFORM,
      platformVersion: '0.6.0',
      sourceInstance: 'https://a.example.com',
      exportPlugins: {},
    });
    const files = readZip(zip);
    expect(Object.keys(files)).toContain('manifest.json');
    expect(Object.keys(files)).toContain('platform/account.json');
    expect(Object.keys(files)).toContain('platform/avatar.png');

    const account = u8ToJson<PlatformAccountSection>(getEntry(files, 'platform/account.json'));
    expect(account.profile.name).toBe('Ada');
    expect(account.preferences.timezone).toBe('UTC');
    expect((account as PlatformAccountSection & { vaultSecrets: unknown[] }).vaultSecrets).toEqual(
      [],
    );

    const manifest = u8ToJson<{ formatVersion: number; sections: { pluginId: string }[] }>(
      getEntry(files, 'manifest.json'),
    );
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.sections.map((s) => s.pluginId)).toEqual([PLATFORM_SECTION_ID]);
  });

  it('invokes a registered plugin exporter and includes its section + blobs', async () => {
    registerExporter('test.plugin', async (ctx) => ({
      pluginId: 'test.plugin',
      schemaVersion: 2,
      data: { owner: ctx.userId, items: [{ id: 'x1' }] },
      blobs: { 'note.txt': new Uint8Array([104, 105]) },
    }));

    const zip = await assembleExport({
      userId: 'u1',
      tenantId: 'default',
      platform: PLATFORM,
      platformVersion: '0.6.0',
      sourceInstance: null,
      exportPlugins: { 'test.plugin': '1.2.0' },
    });
    const files = readZip(zip);
    expect(Object.keys(files)).toContain('plugins/test.plugin/data.json');
    expect(Object.keys(files)).toContain('plugins/test.plugin/blobs/note.txt');
    const data = u8ToJson<{ owner: string }>(getEntry(files, 'plugins/test.plugin/data.json'));
    expect(data.owner).toBe('u1'); // scoped to the requesting user

    const manifest = u8ToJson<{ sections: { pluginId: string; pluginVersion?: string }[] }>(
      getEntry(files, 'manifest.json'),
    );
    const section = manifest.sections.find((s) => s.pluginId === 'test.plugin');
    // pluginVersion comes from the installed manifest, not the resolver.
    expect(section?.pluginVersion).toBe('1.2.0');
  });

  it('does not invoke an exporter for a plugin outside the allow-list', async () => {
    let called = false;
    registerExporter('test.plugin', async () => {
      called = true;
      return { pluginId: 'test.plugin', schemaVersion: 1, data: {} };
    });
    await assembleExport({
      userId: 'u1',
      tenantId: 'default',
      platform: PLATFORM,
      platformVersion: '0.6.0',
      sourceInstance: null,
      exportPlugins: {}, // not permitted/enabled
    });
    expect(called).toBe(false);
  });

  it('omits files when the caller opts out of includeFiles', async () => {
    registerExporter('test.plugin', async () => ({
      pluginId: 'test.plugin',
      schemaVersion: 1,
      data: { ok: true },
      blobs: { 'note.txt': new Uint8Array([1, 2, 3]) },
    }));
    const zip = await assembleExport({
      userId: 'u1',
      tenantId: 'default',
      platform: PLATFORM,
      platformVersion: '0.6.0',
      sourceInstance: null,
      exportPlugins: { 'test.plugin': '1.0.0' },
      options: { includeFiles: false },
    });
    const files = readZip(zip);
    expect(Object.keys(files)).not.toContain('plugins/test.plugin/blobs/note.txt');
    expect(Object.keys(files)).not.toContain('platform/avatar.png');
  });

  it('carries secretMetadata and warnings from a resolver into the manifest', async () => {
    registerExporter('test.plugin', async () => ({
      pluginId: 'test.plugin',
      schemaVersion: 1,
      data: {},
      secretMetadata: [{ label: 'API key', provider: 'openai', exists: true }],
      warnings: ['one attachment was too large and was skipped'],
    }));
    const zip = await assembleExport({
      userId: 'u1',
      tenantId: 'default',
      platform: PLATFORM,
      platformVersion: '0.6.0',
      sourceInstance: null,
      exportPlugins: { 'test.plugin': '1.0.0' },
    });
    const files = readZip(zip);
    const manifest = u8ToJson<{
      sections: { pluginId: string; secretMetadata?: unknown[]; warnings?: string[] }[];
    }>(getEntry(files, 'manifest.json'));
    const section = manifest.sections.find((s) => s.pluginId === 'test.plugin');
    expect(section?.secretMetadata).toEqual([
      { label: 'API key', provider: 'openai', exists: true },
    ]);
    expect(section?.warnings).toEqual(['one attachment was too large and was skipped']);
  });

  it('excludes a throwing exporter and records it as a failure, without aborting the export', async () => {
    registerExporter('bad.plugin', async () => {
      throw new Error('boom');
    });
    registerExporter('good.plugin', async () => ({
      pluginId: 'good.plugin',
      schemaVersion: 1,
      data: { ok: true },
    }));
    const zip = await assembleExport({
      userId: 'u1',
      tenantId: 'default',
      platform: PLATFORM,
      platformVersion: '0.6.0',
      sourceInstance: null,
      exportPlugins: { 'bad.plugin': '1.0.0', 'good.plugin': '1.0.0' },
    });
    const files = readZip(zip);
    expect(Object.keys(files)).toContain('plugins/good.plugin/data.json');
    expect(Object.keys(files)).not.toContain('plugins/bad.plugin/data.json');

    const manifest = u8ToJson<{
      sections: { pluginId: string }[];
      failures?: { pluginId: string; error: string }[];
    }>(getEntry(files, 'manifest.json'));
    expect(manifest.sections.map((s) => s.pluginId)).toContain('good.plugin');
    expect(manifest.failures).toEqual([{ pluginId: 'bad.plugin', error: 'boom' }]);
  });
});

describe('applyImport', () => {
  async function roundTripBundle(exportPlugins: Record<string, string>): Promise<Uint8Array> {
    return assembleExport({
      userId: 'u1',
      tenantId: 'default',
      platform: PLATFORM,
      platformVersion: '0.6.0',
      sourceInstance: null,
      exportPlugins,
    });
  }

  it('applies the platform slice and a registered plugin importer', async () => {
    registerExporter('test.plugin', async () => ({
      pluginId: 'test.plugin',
      schemaVersion: 1,
      data: { refs: ['src-1', 'src-1', 'src-2'] },
    }));
    const bytes = await roundTripBundle({ 'test.plugin': '1.0.0' });

    let platformApplied: PlatformAccountSection | undefined;
    let importedSection: PluginExportSection | undefined;
    let importedCtx: ImportContext | undefined;
    registerImporter('test.plugin', async (section, ctx) => {
      importedSection = section;
      importedCtx = ctx;
    });

    const summary = await applyImport({
      bytes,
      userId: 'u2', // importing into a different account (cross-instance migration)
      tenantId: 'default',
      importPlugins: new Set(['test.plugin']),
      platformImporter: async (account) => {
        platformApplied = account;
      },
    });

    expect(summary.sections).toEqual([
      { pluginId: PLATFORM_SECTION_ID, status: 'imported' },
      { pluginId: 'test.plugin', status: 'imported' },
    ]);
    // Narrow the captured values — the importer callbacks above set them.
    expect(platformApplied).toBeDefined();
    expect((platformApplied as PlatformAccountSection).profile.name).toBe('Ada');
    expect(importedSection).toBeDefined();
    expect((importedSection as PluginExportSection).schemaVersion).toBe(1);
    // ctx is scoped to the importing user with a working remapper.
    expect(importedCtx).toBeDefined();
    const ctx = importedCtx as ImportContext;
    expect(ctx.userId).toBe('u2');
    expect(ctx.remapId('src-1')).toBe(ctx.remapId('src-1'));
    expect(ctx.remapId('src-1')).not.toBe(ctx.remapId('src-2'));
  });

  it('skips a plugin section that is not in the import allow-list (with a warning)', async () => {
    registerExporter('test.plugin', async () => ({
      pluginId: 'test.plugin',
      schemaVersion: 1,
      data: {},
    }));
    const bytes = await roundTripBundle({ 'test.plugin': '1.0.0' });

    const summary = await applyImport({
      bytes,
      userId: 'u2',
      tenantId: 'default',
      importPlugins: new Set(), // not installed / not permitted
      platformImporter: async () => undefined,
    });
    const section = summary.sections.find((s) => s.pluginId === 'test.plugin');
    expect(section?.status).toBe('skipped');
    expect(section?.warning).toMatch(/not installed/);
  });
});
