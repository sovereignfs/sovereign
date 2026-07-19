import type { SovereignManifest } from '@sovereignfs/manifest';
import { describe, expect, it } from 'vitest';
import { getDevelopmentPluginIds, getExamplePluginIds } from '../registry';

function manifest(id: string, example?: boolean, development?: boolean): SovereignManifest {
  return { id, example, development } as unknown as SovereignManifest;
}

describe('getExamplePluginIds', () => {
  it('returns only ids of plugins marked example: true', () => {
    const plugins = [
      manifest('fs.sovereign.console'),
      manifest('fs.sovereign.example-basic', true),
      manifest('fs.sovereign.example-api', true),
      manifest('fs.sovereign.launcher', false),
    ];
    expect(getExamplePluginIds(plugins)).toEqual([
      'fs.sovereign.example-basic',
      'fs.sovereign.example-api',
    ]);
  });

  it('returns an empty array when no plugin is an example', () => {
    expect(getExamplePluginIds([manifest('a'), manifest('b', false)])).toEqual([]);
  });
});

describe('getDevelopmentPluginIds', () => {
  it('returns only ids of plugins marked development: true', () => {
    const plugins = [
      manifest('fs.sovereign.console'),
      manifest('fs.sovereign.tritext', false, true),
      manifest('fs.sovereign.ledger', false, true),
      manifest('fs.sovereign.tasks', false, false),
    ];
    expect(getDevelopmentPluginIds(plugins)).toEqual([
      'fs.sovereign.tritext',
      'fs.sovereign.ledger',
    ]);
  });

  it('returns an empty array when no plugin is flagged development', () => {
    expect(getDevelopmentPluginIds([manifest('a'), manifest('b', false, false)])).toEqual([]);
  });
});
