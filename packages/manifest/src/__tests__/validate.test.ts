import { describe, expect, it } from 'vitest';
import { manifestDatabaseIsolation } from '../schema';
import { validateManifest } from '../validate';

const base = {
  schemaVersion: 1,
  id: 'fs.sovereign.tasks',
  name: 'Tasks',
  version: '1.0.0',
  type: 'platform',
  runtime: 'native',
  routePrefix: '/tasks',
  permissions: ['auth:session', 'db:readWrite'],
  compatibility: { minPlatformVersion: '0.4.0' },
};

describe('validateManifest', () => {
  it('accepts a valid platform manifest', () => {
    const res = validateManifest(base);
    expect(res.valid).toBe(true);
  });

  it('fails when a required field is missing', () => {
    const clone: Record<string, unknown> = { ...base };
    delete clone.schemaVersion;
    const res = validateManifest(clone);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('schemaVersion');
    }
  });

  it('fails on an invalid enum value', () => {
    const res = validateManifest({ ...base, runtime: 'wasm' });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('runtime');
    }
  });

  it('rejects planned runtime values until they are implemented', () => {
    for (const runtime of ['static', 'iframe-local', 'iframe-remote', 'external']) {
      const res = validateManifest({ ...base, runtime });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.errors.join(' ')).toContain('runtime');
      }
    }
  });

  it('requires repository when type is "sovereign"', () => {
    const res = validateManifest({ ...base, type: 'sovereign' });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('repository');
    }
  });

  it('accepts a "sovereign" manifest that declares a repository', () => {
    const res = validateManifest({
      ...base,
      type: 'sovereign',
      repository: 'https://github.com/sovereignfs/sovereign-plugin-tasks',
    });
    expect(res.valid).toBe(true);
  });

  it('rejects unknown fields (strict)', () => {
    const res = validateManifest({ ...base, bogus: true });
    expect(res.valid).toBe(false);
  });

  it('rejects a routePrefix that does not start with "/"', () => {
    const res = validateManifest({ ...base, routePrefix: 'tasks' });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('routePrefix');
    }
  });

  it('accepts a manifest with an icon field', () => {
    const res = validateManifest({ ...base, icon: 'icon.svg' });
    expect(res.valid).toBe(true);
  });

  it('accepts a manifest without an icon field (optional)', () => {
    const { icon: _icon, ...withoutIcon } = { ...base, icon: 'icon.svg' };
    const res = validateManifest(withoutIcon);
    expect(res.valid).toBe(true);
  });

  it('accepts a manifest that declares apiProvider (PLT-16)', () => {
    const res = validateManifest({ ...base, apiProvider: true });
    expect(res.valid).toBe(true);
  });

  it('accepts a manifest that declares publicRoutes (RFC 0042)', () => {
    const res = validateManifest({
      ...base,
      publicRoutes: [{ prefix: '/p', description: 'Token-protected public read-only pages.' }],
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a publicRoutes entry without a description', () => {
    expect(validateManifest({ ...base, publicRoutes: [{ prefix: '/p' }] }).valid).toBe(true);
  });

  it('rejects a publicRoutes prefix that does not start with "/"', () => {
    const res = validateManifest({ ...base, publicRoutes: [{ prefix: 'p' }] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('publicRoutes');
  });

  it('rejects a publicRoutes prefix of "/"', () => {
    const res = validateManifest({ ...base, publicRoutes: [{ prefix: '/' }] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('publicRoutes');
  });

  it('rejects a publicRoutes prefix containing ".." segments', () => {
    const res = validateManifest({ ...base, publicRoutes: [{ prefix: '/p/../../etc' }] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('publicRoutes');
  });

  it('rejects a publicRoutes prefix containing route group / interception markers', () => {
    expect(validateManifest({ ...base, publicRoutes: [{ prefix: '/(group)' }] }).valid).toBe(false);
    expect(validateManifest({ ...base, publicRoutes: [{ prefix: '/(.)p' }] }).valid).toBe(false);
  });

  it('rejects an empty publicRoutes array', () => {
    expect(validateManifest({ ...base, publicRoutes: [] }).valid).toBe(false);
  });

  it('rejects duplicate publicRoutes prefixes within a plugin', () => {
    const res = validateManifest({
      ...base,
      publicRoutes: [{ prefix: '/p' }, { prefix: '/p' }],
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('unique');
  });

  it('accepts a manifest that declares webhooks (RFC 0050)', () => {
    const res = validateManifest({
      ...base,
      webhooks: [
        {
          path: '/webhooks/provider',
          description: 'Provider delivery callback',
          methods: ['POST'],
          maxBodyBytes: 262144,
          requiresSignature: true,
        },
      ],
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a webhooks entry with only a path — every other field defaults', () => {
    const manifest = { ...base, webhooks: [{ path: '/webhooks/provider' }] };
    const res = validateManifest(manifest);
    expect(res.valid).toBe(true);
  });

  it('defaults methods to ["POST"], maxBodyBytes to 262144, and requiresSignature to false', () => {
    const res = validateManifest({ ...base, webhooks: [{ path: '/webhooks/provider' }] });
    expect(res.valid).toBe(true);
    if (res.valid) {
      const webhook = res.manifest.webhooks?.[0];
      expect(webhook?.methods).toEqual(['POST']);
      expect(webhook?.maxBodyBytes).toBe(262144);
      expect(webhook?.requiresSignature).toBe(false);
    }
  });

  it('accepts a GET webhook for provider verification challenges', () => {
    const res = validateManifest({
      ...base,
      webhooks: [{ path: '/webhooks/verify', methods: ['GET'] }],
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a webhook path that does not start with "/"', () => {
    const res = validateManifest({ ...base, webhooks: [{ path: 'webhooks/provider' }] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('webhook path');
  });

  it('rejects a webhook path of "/"', () => {
    const res = validateManifest({ ...base, webhooks: [{ path: '/' }] });
    expect(res.valid).toBe(false);
  });

  it('rejects a webhook path containing ".." segments', () => {
    const res = validateManifest({
      ...base,
      webhooks: [{ path: '/webhooks/../../etc' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects a webhook path containing route group / interception markers', () => {
    expect(validateManifest({ ...base, webhooks: [{ path: '/(group)' }] }).valid).toBe(false);
    expect(validateManifest({ ...base, webhooks: [{ path: '/(.)webhooks' }] }).valid).toBe(false);
  });

  it('rejects an unknown HTTP method', () => {
    const res = validateManifest({
      ...base,
      webhooks: [{ path: '/webhooks/provider', methods: ['DELETE'] }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects an empty methods array', () => {
    const res = validateManifest({
      ...base,
      webhooks: [{ path: '/webhooks/provider', methods: [] }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects maxBodyBytes above the 5 MiB hard cap', () => {
    const res = validateManifest({
      ...base,
      webhooks: [{ path: '/webhooks/provider', maxBodyBytes: 6 * 1024 * 1024 }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects maxBodyBytes of 0 or negative', () => {
    for (const maxBodyBytes of [0, -1]) {
      const res = validateManifest({
        ...base,
        webhooks: [{ path: '/webhooks/provider', maxBodyBytes }],
      });
      expect(res.valid).toBe(false);
    }
  });

  it('rejects an empty webhooks array', () => {
    expect(validateManifest({ ...base, webhooks: [] }).valid).toBe(false);
  });

  it('rejects duplicate webhook paths within a plugin', () => {
    const res = validateManifest({
      ...base,
      webhooks: [{ path: '/webhooks/provider' }, { path: '/webhooks/provider' }],
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('unique');
  });

  it('accepts publicRoutes and webhooks declared together', () => {
    const res = validateManifest({
      ...base,
      publicRoutes: [{ prefix: '/p' }],
      webhooks: [{ path: '/webhooks/provider' }],
    });
    expect(res.valid).toBe(true);
  });

  const checkoutReceiver = {
    name: 'checkout-session',
    path: '/cart',
    title: 'Start checkout',
    inputSchema: { type: 'object', properties: { items: { type: 'array' } }, required: ['items'] },
  };

  it('accepts a manifest declaring a handoff receiver (RFC 0053)', () => {
    const res = validateManifest({ ...base, handoffs: { receives: [checkoutReceiver] } });
    expect(res.valid).toBe(true);
  });

  it('defaults a receiver\'s "public" field to false (authenticated only)', () => {
    const res = validateManifest({ ...base, handoffs: { receives: [checkoutReceiver] } });
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.manifest.handoffs?.receives?.[0]?.public).toBe(false);
    }
  });

  it('accepts a receiver explicitly declared public', () => {
    const res = validateManifest({
      ...base,
      handoffs: { receives: [{ ...checkoutReceiver, public: true }] },
    });
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.manifest.handoffs?.receives?.[0]?.public).toBe(true);
    }
  });

  it('accepts a receiver without inputSchema or description (both optional)', () => {
    const { inputSchema: _inputSchema, ...withoutSchema } = checkoutReceiver;
    const res = validateManifest({ ...base, handoffs: { receives: [withoutSchema] } });
    expect(res.valid).toBe(true);
  });

  it('accepts a manifest declaring handoffs.sends', () => {
    const res = validateManifest({
      ...base,
      handoffs: {
        sends: [
          {
            provider: 'io.openfs.sovereign.checkout',
            name: 'checkout-session',
            reason: 'Send selected items to checkout',
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('accepts receives and sends declared together', () => {
    const res = validateManifest({
      ...base,
      handoffs: {
        receives: [checkoutReceiver],
        sends: [{ provider: 'com.example.other', name: 'other-flow' }],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a handoff path that does not start with "/"', () => {
    const res = validateManifest({
      ...base,
      handoffs: { receives: [{ ...checkoutReceiver, path: 'cart' }] },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('handoff path');
  });

  it('rejects a handoff path of "/"', () => {
    const res = validateManifest({
      ...base,
      handoffs: { receives: [{ ...checkoutReceiver, path: '/' }] },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects a handoff path containing ".." segments', () => {
    const res = validateManifest({
      ...base,
      handoffs: { receives: [{ ...checkoutReceiver, path: '/../etc' }] },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects an invalid handoff name', () => {
    const res = validateManifest({
      ...base,
      handoffs: { receives: [{ ...checkoutReceiver, name: 'Not_Valid' }] },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects an empty receives array', () => {
    expect(validateManifest({ ...base, handoffs: { receives: [] } }).valid).toBe(false);
  });

  it('rejects duplicate receiver names within a plugin', () => {
    const res = validateManifest({
      ...base,
      handoffs: {
        receives: [checkoutReceiver, { ...checkoutReceiver, path: '/other' }],
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('unique');
  });

  it('rejects duplicate receiver paths within a plugin', () => {
    const res = validateManifest({
      ...base,
      handoffs: {
        receives: [checkoutReceiver, { ...checkoutReceiver, name: 'other-name' }],
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('unique');
  });

  it('rejects an unknown key on a receiver entry (strict)', () => {
    const res = validateManifest({
      ...base,
      handoffs: { receives: [{ ...checkoutReceiver, bogus: true }] },
    });
    expect(res.valid).toBe(false);
  });

  it('accepts a manifest declaring handoffs:send and handoffs:receive permissions', () => {
    const res = validateManifest({
      ...base,
      permissions: [...base.permissions, 'handoffs:send', 'handoffs:receive'],
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a manifest declaring installable: true with an icon (RFC 0081)', () => {
    expect(validateManifest({ ...base, installable: true, icon: 'icon.svg' }).valid).toBe(true);
  });

  it('accepts a manifest with no installable field (default behavior)', () => {
    expect(validateManifest(base).valid).toBe(true);
  });

  it('rejects a non-boolean installable value', () => {
    expect(validateManifest({ ...base, installable: 'yes', icon: 'icon.svg' }).valid).toBe(false);
  });

  it('accepts installable and offline declared independently (deliberately uncoupled)', () => {
    expect(
      validateManifest({
        ...base,
        installable: true,
        icon: 'icon.svg',
        offline: 'offline-first',
      }).valid,
    ).toBe(true);
    expect(validateManifest({ ...base, installable: true, icon: 'icon.svg' }).valid).toBe(true);
    expect(validateManifest({ ...base, offline: 'offline-first' }).valid).toBe(true);
  });

  it('rejects installable: true with no icon and no author-supplied icons set (RFC 0081)', () => {
    const res = validateManifest({ ...base, installable: true });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('installable');
  });

  it('accepts installable: true with only an author-supplied icons set, no icon', () => {
    expect(
      validateManifest({
        ...base,
        installable: true,
        icons: { png192: 'icon-192.png', png512: 'icon-512.png', maskable512: 'icon-mask.png' },
      }).valid,
    ).toBe(true);
  });

  it('accepts a partial author-supplied icons set', () => {
    expect(
      validateManifest({ ...base, installable: true, icons: { png192: 'icon-192.png' } }).valid,
    ).toBe(true);
  });

  it('accepts icons declared without installable (harmless, just unused)', () => {
    expect(validateManifest({ ...base, icons: { png192: 'icon-192.png' } }).valid).toBe(true);
  });

  it('rejects an unknown key inside icons (strict)', () => {
    expect(
      validateManifest({ ...base, installable: true, icons: { png192: 'x.png', bogus: 'y' } })
        .valid,
    ).toBe(false);
  });

  it('accepts a manifest declaring surfaces (RFC 0080)', () => {
    expect(validateManifest({ ...base, surfaces: ['mobile', 'desktop'] }).valid).toBe(true);
  });

  it('accepts a manifest with no surfaces field (available everywhere)', () => {
    expect(validateManifest(base).valid).toBe(true);
  });

  it('rejects an empty surfaces array', () => {
    const res = validateManifest({ ...base, surfaces: [] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('surfaces');
  });

  it('rejects duplicate surfaces entries', () => {
    const res = validateManifest({ ...base, surfaces: ['mobile', 'mobile'] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('unique');
  });

  it('rejects an invalid surfaces value', () => {
    const res = validateManifest({ ...base, surfaces: ['tablet'] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('surfaces');
  });

  it('accepts a manifest declaring public: true with shell: minimal (RFC 0089)', () => {
    expect(validateManifest({ ...base, public: true, shell: 'minimal' }).valid).toBe(true);
  });

  it('rejects public: true without shell: minimal', () => {
    const res = validateManifest({ ...base, public: true });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('public');
  });

  it('rejects public: true with shell: default', () => {
    const res = validateManifest({ ...base, public: true, shell: 'default' });
    expect(res.valid).toBe(false);
  });

  it('rejects public: true with shell: overlay', () => {
    const res = validateManifest({ ...base, public: true, shell: 'overlay' });
    expect(res.valid).toBe(false);
  });

  it('rejects public: true combined with adminOnly: true', () => {
    const res = validateManifest({
      ...base,
      public: true,
      shell: 'minimal',
      adminOnly: true,
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('public');
  });

  it('rejects public: true combined with publicRoutes', () => {
    const res = validateManifest({
      ...base,
      public: true,
      shell: 'minimal',
      publicRoutes: [{ prefix: '/p' }],
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('public');
  });

  it('rejects public: true combined with a paid monetization model', () => {
    const res = validateManifest({
      ...base,
      type: 'sovereign',
      repository: 'https://github.com/sovereignfs/sovereign-plugin-example',
      public: true,
      shell: 'minimal',
      monetization: {
        model: 'one_time',
        license: { publicKey: 'a'.repeat(43) },
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('public');
  });

  it('accepts public: true combined with an explicit free monetization model', () => {
    const res = validateManifest({
      ...base,
      type: 'sovereign',
      repository: 'https://github.com/sovereignfs/sovereign-plugin-example',
      public: true,
      shell: 'minimal',
      monetization: { model: 'free' },
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a manifest with no public field at all', () => {
    expect(validateManifest({ ...base }).valid).toBe(true);
  });

  it('accepts a manifest declaring offline: "offline-first" (research 0012)', () => {
    expect(validateManifest({ ...base, offline: 'offline-first' }).valid).toBe(true);
  });

  it('accepts a manifest declaring offline: "device-only" (research 0012)', () => {
    expect(validateManifest({ ...base, offline: 'device-only' }).valid).toBe(true);
  });

  it('accepts a manifest with no offline field at all', () => {
    expect(validateManifest({ ...base }).valid).toBe(true);
  });

  it('rejects the old offline.routes[]/offline.root object shape (RFC 0074, removed by RFC 0078)', () => {
    expect(validateManifest({ ...base, offline: { routes: [{ prefix: '/cards' }] } }).valid).toBe(
      false,
    );
    expect(validateManifest({ ...base, offline: { root: true } }).valid).toBe(false);
  });

  it('rejects the old plain-boolean offline shape (RFC 0078, replaced by the enum)', () => {
    expect(validateManifest({ ...base, offline: true }).valid).toBe(false);
    expect(validateManifest({ ...base, offline: false }).valid).toBe(false);
  });

  it('rejects an offline value outside the two declared tiers', () => {
    expect(validateManifest({ ...base, offline: 'offline' }).valid).toBe(false);
    expect(validateManifest({ ...base, offline: 'none' }).valid).toBe(false);
  });

  it('rejects the removed "offline:write" permission as unknown', () => {
    const res = validateManifest({
      ...base,
      permissions: ['offline:write'],
    });
    expect(res.valid).toBe(false);
  });

  it('accepts a manifest that declares the example marker', () => {
    expect(validateManifest({ ...base, example: true }).valid).toBe(true);
  });

  it('rejects a non-boolean example marker', () => {
    expect(validateManifest({ ...base, example: 'yes' }).valid).toBe(false);
  });

  it('rejects any "database" key at all — the field was retired entirely (RFC 0071 deferred, no encryption carve-out left to configure)', () => {
    expect(validateManifest({ ...base, type: 'sovereign', database: 'shared' }).valid).toBe(false);
    expect(validateManifest({ ...base, type: 'sovereign', database: 'isolated' }).valid).toBe(
      false,
    );
    expect(
      validateManifest({ ...base, type: 'sovereign', database: { isolation: 'isolated' } }).valid,
    ).toBe(false);
    expect(
      validateManifest({ ...base, type: 'sovereign', database: { requireEncryption: true } }).valid,
    ).toBe(false);
    expect(validateManifest({ ...base, type: 'sovereign', database: {} }).valid).toBe(false);
  });

  it('derives database isolation from type — always isolated except type: "platform"', () => {
    expect(manifestDatabaseIsolation('sovereign')).toBe('isolated');
    expect(manifestDatabaseIsolation('community')).toBe('isolated');
    expect(manifestDatabaseIsolation('platform')).toBe('shared');
    expect(manifestDatabaseIsolation(undefined)).toBe('isolated');
  });

  it('accepts shell: "overlay" (RFC 0001)', () => {
    const res = validateManifest({ ...base, shell: 'overlay' });
    expect(res.valid).toBe(true);
  });

  it('accepts shellConfig.overlaySize when shell is "overlay"', () => {
    const res = validateManifest({
      ...base,
      shell: 'overlay',
      shellConfig: { overlaySize: 'md' },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects shellConfig.overlaySize without shell: "overlay"', () => {
    const res = validateManifest({ ...base, shellConfig: { overlaySize: 'md' } });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('overlaySize');
    }
  });

  it('accepts shellConfig.mobileHeader/mobileFooter with no shell set (RFC 0075)', () => {
    const res = validateManifest({
      ...base,
      shellConfig: { mobileHeader: false, mobileFooter: false },
    });
    expect(res.valid).toBe(true);
  });

  it('accepts shellConfig.mobileHeader/mobileFooter when shell is "default" (RFC 0075)', () => {
    const res = validateManifest({
      ...base,
      shell: 'default',
      shellConfig: { mobileFooter: false },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects shellConfig.mobileHeader when shell is "minimal" (RFC 0075)', () => {
    const res = validateManifest({
      ...base,
      shell: 'minimal',
      shellConfig: { mobileHeader: false },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('mobileHeader');
    }
  });

  it('rejects shellConfig.mobileFooter when shell is "overlay" (RFC 0075)', () => {
    const res = validateManifest({
      ...base,
      shell: 'overlay',
      shellConfig: { mobileFooter: false },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('mobileFooter');
    }
  });

  it('accepts the crypto:use permission (RFC 0092)', () => {
    const res = validateManifest({
      ...base,
      permissions: ['auth:session', 'db:readWrite', 'crypto:use'],
    });
    expect(res.valid).toBe(true);
  });

  it('accepts the reserved cross-plugin data-sharing permissions (RFC 0002)', () => {
    const res = validateManifest({
      ...base,
      permissions: ['auth:session', 'db:readWrite', 'data:provide', 'data:consume'],
    });
    expect(res.valid).toBe(true);
  });

  // RFC 0024 — compatibility field validation
  it('rejects schemaVersion greater than the current maximum (RFC 0024)', () => {
    const res = validateManifest({ ...base, schemaVersion: 999 });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('schemaVersion');
    }
  });

  it('rejects a non-semver string in minPlatformVersion (RFC 0024)', () => {
    const res = validateManifest({
      ...base,
      compatibility: { minPlatformVersion: 'latest' },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('semver');
    }
  });

  it('rejects a non-semver string in maxPlatformVersion (RFC 0024)', () => {
    const res = validateManifest({
      ...base,
      compatibility: { minPlatformVersion: '0.4.0', maxPlatformVersion: 'v2.x' },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('semver');
    }
  });

  it('accepts compatibility with both min and max versions (RFC 0024)', () => {
    const res = validateManifest({
      ...base,
      compatibility: { minPlatformVersion: '0.4.0', maxPlatformVersion: '1.0.0' },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects unknown fields inside compatibility (RFC 0024)', () => {
    const res = validateManifest({
      ...base,
      compatibility: { minPlatformVersion: '0.4.0', unknownField: true },
    });
    expect(res.valid).toBe(false);
  });

  it('accepts external connection provider declarations (RFC 0049)', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'email.google',
            title: 'Google Mail',
            callbackPath: '/connections/google/callback',
            scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('accepts provider-defined OAuth scope strings that are not "user"/"plugin"/"instance"', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'git.github',
            title: 'GitHub',
            callbackPath: '/connections/github/callback',
            scopes: ['repo', 'read:user'],
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects an empty connection provider scopes array', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'git.github',
            title: 'GitHub',
            callbackPath: '/connections/github/callback',
            scopes: [],
          },
        ],
      },
    });
    expect(res.valid).toBe(false);
  });

  it('accepts external provider config declarations (Task 3.27)', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'github',
            title: 'GitHub',
            callbackPath: '/connections/github/callback',
            scopes: ['user'],
            config: {
              public: {
                clientId: {
                  label: 'Client ID',
                  env: 'GITHUB_CLIENT_ID',
                  required: true,
                },
              },
              secrets: {
                clientSecret: {
                  label: 'Client secret',
                  env: 'GITHUB_CLIENT_SECRET',
                  required: true,
                },
              },
            },
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects malformed external provider config env keys (Task 3.27)', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'github',
            title: 'GitHub',
            callbackPath: '/connections/github/callback',
            scopes: ['user'],
            config: {
              secrets: {
                clientSecret: {
                  label: 'Client secret',
                  env: 'github-client-secret',
                },
              },
            },
          },
        ],
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('provider config env keys');
    }
  });

  it('rejects connection callback paths outside the plugin route tree (RFC 0049)', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'Email.Google',
            title: 'Google Mail',
            callbackPath: 'connections/google/callback',
            scopes: ['user'],
          },
        ],
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('callbackPath');
    }
  });

  // RFC 0022 — plugin-declared capabilities
  it('accepts a manifest with a capabilities field (RFC 0022)', () => {
    const res = validateManifest({
      ...base,
      capabilities: {
        'create-item': { description: 'Create items.', defaultGrant: 'all' },
        'delete-item': { description: 'Delete items.' },
      },
    });
    expect(res.valid).toBe(true);
  });

  it('accepts capabilities without defaultGrant (defaults to none)', () => {
    const res = validateManifest({
      ...base,
      capabilities: { 'admin-panel': {} },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects capability names that are not kebab-case lowercase (RFC 0022)', () => {
    const res = validateManifest({
      ...base,
      capabilities: { CreateItem: { description: 'Bad name.' } },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects capability names starting with a digit', () => {
    const res = validateManifest({
      ...base,
      capabilities: { '1bad': {} },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects an invalid defaultGrant value', () => {
    const res = validateManifest({
      ...base,
      capabilities: { feature: { defaultGrant: 'admins' } },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects unknown fields inside a capability declaration', () => {
    const res = validateManifest({
      ...base,
      capabilities: { feature: { bogus: true } },
    });
    expect(res.valid).toBe(false);
  });

  it('accepts a valid schedules declaration (RFC 0046 Phase 1)', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'due-reminders', intervalMinutes: 1, entry: 'app/_jobs/due-reminders.ts' }],
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a schedule entry outside app/', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'x', intervalMinutes: 1, entry: 'lib/jobs.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects a schedule entry that traverses out of the plugin', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'x', intervalMinutes: 1, entry: 'app/../../etc/passwd.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects a non-.ts schedule entry', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'x', intervalMinutes: 1, entry: 'app/_jobs/handler.tsx' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects non-integer and sub-minute intervals', () => {
    for (const intervalMinutes of [0, -1, 1.5]) {
      const res = validateManifest({
        ...base,
        schedules: [{ id: 'x', intervalMinutes, entry: 'app/_jobs/x.ts' }],
      });
      expect(res.valid).toBe(false);
    }
  });

  it('rejects duplicate schedule ids within a plugin', () => {
    const res = validateManifest({
      ...base,
      schedules: [
        { id: 'same', intervalMinutes: 1, entry: 'app/_jobs/a.ts' },
        { id: 'same', intervalMinutes: 5, entry: 'app/_jobs/b.ts' },
      ],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects schedule ids that are not kebab-case lowercase', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'DueReminders', intervalMinutes: 1, entry: 'app/_jobs/x.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects an empty schedules array', () => {
    const res = validateManifest({ ...base, schedules: [] });
    expect(res.valid).toBe(false);
  });

  it('accepts a valid jobs declaration (RFC 0046)', () => {
    const res = validateManifest({
      ...base,
      jobs: [{ type: 'sync.remote', entry: 'app/_jobs/sync-remote.ts', maxAttempts: 5 }],
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a valid events declaration (RFC 0045)', () => {
    const res = validateManifest({
      ...base,
      events: [{ pattern: 'list:*', entry: 'app/_events/authorize-list.ts' }],
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a jobs declaration without optional fields', () => {
    const res = validateManifest({
      ...base,
      jobs: [{ type: 'cleanup', entry: 'app/_jobs/cleanup.ts' }],
    });
    expect(res.valid).toBe(true);
  });

  it('accepts an events declaration without optional fields', () => {
    const res = validateManifest({
      ...base,
      events: [{ pattern: 'list:overview', entry: 'app/_events/authorize.ts' }],
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a job entry outside app/', () => {
    const res = validateManifest({
      ...base,
      jobs: [{ type: 'sync.remote', entry: 'lib/jobs.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('accepts a multi-segment event pattern with and without a trailing wildcard', () => {
    for (const pattern of ['list:item:comments', 'list:item:comments:*']) {
      const res = validateManifest({
        ...base,
        events: [{ pattern, entry: 'app/_events/authorize.ts' }],
      });
      expect(res.valid, `expected pattern "${pattern}" to be accepted`).toBe(true);
    }
  });

  it('rejects an event pattern with a wildcard outside the trailing segment', () => {
    for (const pattern of ['*', '*:list', 'li*st', 'list:*:comments']) {
      const res = validateManifest({
        ...base,
        events: [{ pattern, entry: 'app/_events/authorize.ts' }],
      });
      expect(res.valid, `expected pattern "${pattern}" to be rejected`).toBe(false);
    }
  });

  it('rejects an event pattern that is not lowercase colon-separated segments', () => {
    for (const pattern of ['List:*', 'list_item:*', 'list.item:*']) {
      const res = validateManifest({
        ...base,
        events: [{ pattern, entry: 'app/_events/authorize.ts' }],
      });
      expect(res.valid, `expected pattern "${pattern}" to be rejected`).toBe(false);
    }
  });

  it('rejects an event entry outside app/', () => {
    const res = validateManifest({
      ...base,
      events: [{ pattern: 'list:*', entry: 'lib/authorize.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects a job entry that traverses out of the plugin', () => {
    const res = validateManifest({
      ...base,
      jobs: [{ type: 'sync.remote', entry: 'app/../../etc/passwd.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects an event entry that traverses out of the plugin', () => {
    const res = validateManifest({
      ...base,
      events: [{ pattern: 'list:*', entry: 'app/../../etc/passwd.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects a non-.ts job entry', () => {
    const res = validateManifest({
      ...base,
      jobs: [{ type: 'sync.remote', entry: 'app/_jobs/handler.tsx' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects a non-.ts event entry', () => {
    const res = validateManifest({
      ...base,
      events: [{ pattern: 'list:*', entry: 'app/_events/authorize.tsx' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects duplicate job types within a plugin', () => {
    const res = validateManifest({
      ...base,
      jobs: [
        { type: 'sync.remote', entry: 'app/_jobs/a.ts' },
        { type: 'sync.remote', entry: 'app/_jobs/b.ts' },
      ],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects duplicate event patterns within a plugin', () => {
    const res = validateManifest({
      ...base,
      events: [
        { pattern: 'list:*', entry: 'app/_events/a.ts' },
        { pattern: 'list:*', entry: 'app/_events/b.ts' },
      ],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects job types that are not lowercase dot-separated segments', () => {
    for (const type of ['SyncRemote', 'sync-remote', 'sync..remote', '.sync', 'sync.']) {
      const res = validateManifest({
        ...base,
        jobs: [{ type, entry: 'app/_jobs/x.ts' }],
      });
      expect(res.valid, `expected type "${type}" to be rejected`).toBe(false);
    }
  });

  it('accepts a multi-segment dotted job type', () => {
    const res = validateManifest({
      ...base,
      jobs: [{ type: 'sync.remote.accounts', entry: 'app/_jobs/x.ts' }],
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a non-integer or sub-1 maxAttempts', () => {
    for (const maxAttempts of [0, -1, 1.5]) {
      const res = validateManifest({
        ...base,
        jobs: [{ type: 'sync.remote', entry: 'app/_jobs/x.ts', maxAttempts }],
      });
      expect(res.valid).toBe(false);
    }
  });

  it('rejects an empty jobs array', () => {
    const res = validateManifest({ ...base, jobs: [] });
    expect(res.valid).toBe(false);
  });

  it('accepts schedules and jobs declared together', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'due-reminders', intervalMinutes: 1, entry: 'app/_jobs/due-reminders.ts' }],
      jobs: [{ type: 'sync.remote', entry: 'app/_jobs/sync-remote.ts' }],
    });
    expect(res.valid).toBe(true);
  });

  it('rejects an empty events array', () => {
    const res = validateManifest({ ...base, events: [] });
    expect(res.valid).toBe(false);
  });

  it('accepts schedules and events declared together', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'due-reminders', intervalMinutes: 1, entry: 'app/_jobs/due-reminders.ts' }],
      events: [{ pattern: 'list:*', entry: 'app/_events/authorize-list.ts' }],
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a valid integrations.optional declaration (RFC 0051)', () => {
    const res = validateManifest({
      ...base,
      integrations: {
        optional: [
          {
            provider: 'io.example.crm',
            reason: 'Link records to contacts',
            contracts: ['crm.contacts'],
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects an integrations entry missing required fields', () => {
    const res = validateManifest({
      ...base,
      integrations: { optional: [{ provider: 'io.example.crm' }] },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('reason');
    }
  });

  it('rejects unknown keys inside an integrations entry', () => {
    const res = validateManifest({
      ...base,
      integrations: {
        optional: [{ provider: 'io.example.crm', reason: 'x', unexpected: true }],
      },
    });
    expect(res.valid).toBe(false);
  });
});
