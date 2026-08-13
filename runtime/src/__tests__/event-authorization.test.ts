import { describe, expect, it, vi } from 'vitest';
import type { PluginEventAuthorizerDecl } from '../../generated/plugin-events';
import { authorizeChannel, patternMatches } from '../event-authorization';

function decl(overrides: Partial<PluginEventAuthorizerDecl> = {}): PluginEventAuthorizerDecl {
  return {
    pluginId: 'com.example.notes',
    pattern: 'list:*',
    handler: vi.fn(async () => true),
    ...overrides,
  };
}

describe('patternMatches', () => {
  it('matches an exact pattern against the identical channel', () => {
    expect(patternMatches('list:overview', 'list:overview')).toBe(true);
    expect(patternMatches('list:overview', 'list:other')).toBe(false);
  });

  it('matches a trailing wildcard as a prefix', () => {
    expect(patternMatches('list:*', 'list:123')).toBe(true);
    expect(patternMatches('list:*', 'list:123:comments')).toBe(true);
    expect(patternMatches('list:*', 'listing:123')).toBe(false);
  });

  it('a bare pattern with no wildcard never matches a longer channel', () => {
    expect(patternMatches('list', 'list:123')).toBe(false);
  });
});

describe('authorizeChannel', () => {
  const ctx = {
    userId: 'user-1',
    headers: new Headers({ 'x-sovereign-plugin-id': 'com.example.notes' }),
  };

  it('allows when a matching handler returns true', async () => {
    const d = decl();
    const allowed = await authorizeChannel('com.example.notes', 'list:1', ctx, [d]);
    expect(allowed).toBe(true);
    expect(d.handler).toHaveBeenCalledWith({
      pluginId: 'com.example.notes',
      userId: 'user-1',
      channel: 'list:1',
      headers: ctx.headers,
    });
  });

  it('denies when the matching handler returns false', async () => {
    const d = decl({ handler: async () => false });
    expect(await authorizeChannel('com.example.notes', 'list:1', ctx, [d])).toBe(false);
  });

  it('fails closed when no declared pattern matches the channel', async () => {
    const d = decl({ pattern: 'other:*' });
    const allowed = await authorizeChannel('com.example.notes', 'list:1', ctx, [d]);
    expect(allowed).toBe(false);
    expect(d.handler).not.toHaveBeenCalled();
  });

  it('fails closed when no authorizer is declared for the plugin at all', async () => {
    expect(await authorizeChannel('com.example.notes', 'list:1', ctx, [])).toBe(false);
  });

  it('fails closed (not throws) when the matching handler throws', async () => {
    const d = decl({
      handler: async () => {
        throw new Error('boom');
      },
    });
    await expect(authorizeChannel('com.example.notes', 'list:1', ctx, [d])).resolves.toBe(false);
  });

  it('only consults declarations belonging to the requesting plugin', async () => {
    const otherPlugin = decl({ pluginId: 'com.example.other', handler: vi.fn(async () => true) });
    const allowed = await authorizeChannel('com.example.notes', 'list:1', ctx, [otherPlugin]);
    expect(allowed).toBe(false);
    expect(otherPlugin.handler).not.toHaveBeenCalled();
  });

  it('allows if any of several matching patterns for the plugin returns true', async () => {
    const denies = decl({ pattern: 'list:*', handler: vi.fn(async () => false) });
    const allows = decl({ pattern: 'list:overview', handler: vi.fn(async () => true) });
    const allowed = await authorizeChannel('com.example.notes', 'list:overview', ctx, [
      denies,
      allows,
    ]);
    expect(allowed).toBe(true);
    expect(denies.handler).toHaveBeenCalled();
    expect(allows.handler).toHaveBeenCalled();
  });

  it('a throwing handler does not block a sibling matching pattern from still allowing', async () => {
    const throws = decl({
      pattern: 'list:*',
      handler: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const allows = decl({ pattern: 'list:overview', handler: vi.fn(async () => true) });
    const allowed = await authorizeChannel('com.example.notes', 'list:overview', ctx, [
      throws,
      allows,
    ]);
    expect(allowed).toBe(true);
  });
});
