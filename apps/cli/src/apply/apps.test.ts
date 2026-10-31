import { describe, expect, it } from 'vitest';
import { manifestOf } from '../testing/world.js';
import type { ExternalApp, HostedApp, Manifest, Suite } from '../suite/types.js';
import { databaseOf, externalClient, hostedClient } from './apps.js';

const suite: Suite = {
  schema: 1,
  domain: 'sovereign.example.com',
  core: { version: '0.71.0' },
  database: { version: '18' },
  server: { host: 'h' },
  secrets: { recipients: ['age1abc'] },
};
const manifest = (extra: Record<string, unknown> = {}) => manifestOf(extra) as unknown as Manifest;
const flags = (args: string[]) => {
  const out: Record<string, string[]> = {};
  let current = '';
  for (const word of args) {
    if (word.startsWith('--')) out[(current = word)] = [];
    else out[current]?.push(word);
  }
  return out;
};

describe('what a hosted app is registered as', () => {
  const app: HostedApp = { image: 'ghcr.io/e/notes:1' };

  it('comes from its manifest and its name: addresses on its subdomain, the scopes it asks for, and trusted', () => {
    const args = flags(hostedClient(suite, 'notes', app, manifest()));
    expect(args['--name']).toEqual(['Notes']);
    expect(args['--redirect']).toEqual([
      'https://notes.sovereign.example.com/api/auth/callback/sovereign',
    ]);
    expect(args['--post-logout']).toEqual(['https://notes.sovereign.example.com/']);
    expect(args['--back-channel']).toEqual([
      'https://notes.sovereign.example.com/api/auth/back-channel-logout',
    ]);
    expect(args['--scope']).toEqual(['openid', 'profile', 'email']);
    expect(args['--trusted']).toEqual([]);
    expect(args['--launch-url']).toEqual(['https://notes.sovereign.example.com/']);
    expect(args['--public']).toBeUndefined();
  });

  it('asks to be told of an account deleted at the address its manifest names', () => {
    const args = flags(
      hostedClient(
        suite,
        'notes',
        app,
        manifest({ signIn: { redirect: ['/cb'], accountDeleted: '/gone', scopes: ['openid'] } }),
      ),
    );
    expect(args['--account-deleted']).toEqual(['https://notes.sovereign.example.com/gone']);
  });

  it('has the launcher the manifest gives, changed by what the operator wrote and nothing else', () => {
    const plain = flags(
      hostedClient(
        suite,
        'notes',
        app,
        manifest({ description: 'Notes for us', icon: '/icon.png', launch: '/home' }),
      ),
    );
    expect(plain['--description']).toEqual(['Notes for us']);
    expect(plain['--icon']).toEqual(['https://notes.sovereign.example.com/icon.png']);
    expect(plain['--launch-url']).toEqual(['https://notes.sovereign.example.com/home']);
    const changed = flags(
      hostedClient(
        suite,
        'notes',
        {
          ...app,
          launcher: {
            description: 'Ours',
            launchUrl: 'https://notes.sovereign.example.com/start',
            show: false,
          },
        },
        manifest(),
      ),
    );
    expect(changed['--description']).toEqual(['Ours']);
    expect(changed['--launch-url']).toEqual(['https://notes.sovereign.example.com/start']);
    expect(changed['--hide']).toEqual([]);
  });

  it('is not changed by anything the operator writes about trust or scopes, which are not theirs to give a hosted app', () => {
    const args = hostedClient(
      suite,
      'notes',
      { ...app, trusted: true, scopes: ['roles'] } as HostedApp,
      manifest(),
    );
    expect(args).not.toContain('roles');
  });
});

describe('what an external app is registered as', () => {
  const app: ExternalApp = {
    external: true,
    name: 'Team wiki',
    redirect: ['https://wiki.example.com/cb'],
  };

  it('is only what the operator wrote, untrusted unless they said, and confidential unless they said', () => {
    const args = flags(externalClient(app));
    expect(args['--name']).toEqual(['Team wiki']);
    expect(args['--redirect']).toEqual(['https://wiki.example.com/cb']);
    expect(args['--trusted']).toBeUndefined();
    expect(args['--public']).toBeUndefined();
    expect(args['--scope']).toBeUndefined();
    const full = flags(
      externalClient({
        ...app,
        postLogout: ['https://wiki.example.com/bye'],
        backChannel: 'https://wiki.example.com/out',
        scopes: ['openid', 'roles'],
        type: 'public',
        trusted: true,
      }),
    );
    expect(full['--public']).toEqual([]);
    expect(full['--trusted']).toEqual([]);
    expect(full['--scope']).toEqual(['openid', 'roles']);
    expect(full['--back-channel']).toEqual(['https://wiki.example.com/out']);
  });
});

describe('an app’s database', () => {
  it('is named for the app, with a hyphen made an underscore, and is also the role that owns it', () => {
    expect(databaseOf('notes')).toBe('app_notes');
    expect(databaseOf('team-wiki')).toBe('app_team_wiki');
    expect(databaseOf('a'.repeat(32)).length).toBeLessThan(63);
  });
});
