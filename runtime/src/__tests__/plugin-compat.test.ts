import { describe, expect, it } from 'vitest';
import { getCompatibilityWarnings, recordWarnings } from '../plugin-compat';

describe('recordWarnings', () => {
  it('accumulates across multiple calls for the same plugin rather than overwriting', () => {
    const pluginId = 'fs.example.accumulate';
    recordWarnings(pluginId, ['first warning — e.g. version compatibility']);
    recordWarnings(pluginId, ['second warning — e.g. encryption fallback']);

    const warnings = getCompatibilityWarnings(pluginId);
    expect(warnings).toEqual([
      'first warning — e.g. version compatibility',
      'second warning — e.g. encryption fallback',
    ]);
  });

  it('an empty warnings array does not clear previously recorded warnings', () => {
    const pluginId = 'fs.example.empty-call';
    recordWarnings(pluginId, ['keep me']);
    recordWarnings(pluginId, []);

    expect(getCompatibilityWarnings(pluginId)).toEqual(['keep me']);
  });

  it('returns an empty array for a plugin with no recorded warnings', () => {
    expect(getCompatibilityWarnings('fs.example.never-warned')).toEqual([]);
  });
});
