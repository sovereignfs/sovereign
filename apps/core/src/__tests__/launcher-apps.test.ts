import { describe, expect, it } from 'vitest';
import { launcherApps, listLauncherApps } from '../clients/launcher';
import type { ClientView } from '../clients/registry';

const view = (
  id: string,
  extra: Partial<ClientView> = {},
  launcher: Partial<ClientView['launcher']> = {},
): ClientView => ({
  clientId: id,
  name: id,
  type: 'confidential',
  secretIn: 'header',
  idTokenAlgorithm: 'EdDSA',
  redirectUris: ['https://a.example/cb'],
  postLogoutRedirectUris: [],
  backchannelLogoutUri: undefined,
  endSession: false,
  scopes: ['openid'],
  appScopes: [],
  trusted: false,
  enabled: true,
  launcher: {
    description: undefined,
    icon: undefined,
    launchUrl: `https://${id}.example`,
    show: true,
    ...launcher,
  },
  createdAt: undefined,
  ...extra,
});

describe('which apps the launcher lists', () => {
  it('lists an enabled app that is shown and has somewhere to send people', () => {
    expect(
      launcherApps([
        view('notes', {}, { description: 'Take notes', icon: 'https://i.example/n.png' }),
      ]),
    ).toEqual([
      {
        id: 'notes',
        name: 'notes',
        description: 'Take notes',
        icon: 'https://i.example/n.png',
        launchUrl: 'https://notes.example',
      },
    ]);
  });

  it('leaves out an app that is disabled', () => {
    expect(launcherApps([view('a', { enabled: false })])).toEqual([]);
  });

  it('leaves out an app whose "show in launcher" is off', () => {
    expect(launcherApps([view('a', {}, { show: false })])).toEqual([]);
  });

  it('leaves out an app with no launch address, which has nothing to open', () => {
    expect(launcherApps([view('a', {}, { launchUrl: undefined })])).toEqual([]);
  });

  it('puts the rest in name order, however they were stored', () => {
    const names = launcherApps([
      view('b', { name: 'Zeta' }),
      view('c', { name: 'alpha' }),
      view('a', { name: 'Beta' }),
    ]).map((app) => app.name);
    expect(names).toEqual(['alpha', 'Beta', 'Zeta']);
  });

  it('carries only what a tile needs: no addresses to sign in at, no scopes, no secret', () => {
    const [tile] = launcherApps([view('a', { trusted: true })]);
    expect(Object.keys(tile ?? {}).sort()).toEqual([
      'description',
      'icon',
      'id',
      'launchUrl',
      'name',
    ]);
  });
});

describe('reading the apps for the launcher', () => {
  it('reads the stored apps as the registry does and lists those that qualify', async () => {
    const rows = [
      {
        clientId: 'on',
        name: 'On',
        metadata: { launcher: { launchUrl: 'https://on.example', show: true } },
      },
      {
        clientId: 'off',
        name: 'Off',
        disabled: true,
        metadata: { launcher: { launchUrl: 'https://off.example' } },
      },
      {
        clientId: 'hidden',
        name: 'Hidden',
        metadata: JSON.stringify({ launcher: { launchUrl: 'https://h.example', show: false } }),
      },
      {
        clientId: 'text',
        name: 'Text',
        metadata: JSON.stringify({ launcher: { launchUrl: 'https://t.example' } }),
      },
    ];
    const auth = {
      $context: Promise.resolve({ adapter: { findMany: () => Promise.resolve(rows) } }),
    };
    const apps = await listLauncherApps(auth as unknown as Parameters<typeof listLauncherApps>[0]);
    expect(apps.map((app) => app.id)).toEqual(['on', 'text']);
  });
});
