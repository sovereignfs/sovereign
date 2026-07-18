import { describe, expect, it } from 'vitest';
import { parseInvitePluginIds } from '../invite-plugin-grants';

describe('parseInvitePluginIds', () => {
  it('returns [] for null/undefined', () => {
    expect(parseInvitePluginIds(null)).toEqual([]);
    expect(parseInvitePluginIds(undefined)).toEqual([]);
  });

  it('returns [] for an empty string', () => {
    expect(parseInvitePluginIds('')).toEqual([]);
  });

  it('parses a JSON array of plugin IDs', () => {
    expect(parseInvitePluginIds('["fs.sovereign.tasks","fs.sovereign.wallet"]')).toEqual([
      'fs.sovereign.tasks',
      'fs.sovereign.wallet',
    ]);
  });

  it('drops non-string entries from an otherwise valid array', () => {
    expect(parseInvitePluginIds('["fs.sovereign.tasks", 42, null, true]')).toEqual([
      'fs.sovereign.tasks',
    ]);
  });

  it('returns [] for malformed JSON rather than throwing', () => {
    expect(parseInvitePluginIds('not json')).toEqual([]);
  });

  it('returns [] for valid JSON that is not an array', () => {
    expect(parseInvitePluginIds('{"a":1}')).toEqual([]);
    expect(parseInvitePluginIds('"just a string"')).toEqual([]);
  });
});
