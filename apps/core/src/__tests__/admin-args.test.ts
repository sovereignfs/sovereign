import { describe, expect, it } from 'vitest';
import { parse, UsageError } from '../admin/args';
import { inputOf } from '../admin/run';

describe('the command line of sovereign-admin', () => {
  const ensure = (...words: string[]) => {
    const command = parse(['apps', 'ensure', ...words]);
    if (command.name !== 'ensure') throw new Error('not ensure');
    return command;
  };

  it('reads ensure with every option', () => {
    const command = ensure(
      'notes',
      '--name',
      'Notes app',
      '--redirect',
      'https://a.test/cb',
      'https://b.test/cb',
      '--post-logout',
      'https://a.test/bye',
      '--back-channel=https://a.test/logout',
      '--account-deleted',
      'https://a.test/gone',
      '--scope',
      'openid',
      'profile',
      '--app-scope',
      'notifications:send',
      '--trusted',
      '--launch-url',
      'https://a.test/',
      '--description',
      'Writes things down',
      '--icon',
      'https://a.test/i.png',
      '--hide',
      '--json',
    );
    expect(command).toEqual({
      name: 'ensure',
      key: 'notes',
      json: true,
      app: {
        name: 'Notes app',
        redirect: ['https://a.test/cb', 'https://b.test/cb'],
        postLogout: ['https://a.test/bye'],
        backChannel: 'https://a.test/logout',
        accountDeleted: 'https://a.test/gone',
        scopes: ['openid', 'profile'],
        appScopes: ['notifications:send'],
        isPublic: false,
        trusted: true,
        launchUrl: 'https://a.test/',
        description: 'Writes things down',
        icon: 'https://a.test/i.png',
        hidden: true,
      },
    });
  });

  it('takes a list flag given again as one longer list, and the key before the options', () => {
    const command = ensure(
      'k',
      '--name',
      'N',
      '--redirect',
      'https://a.test/1',
      '--redirect',
      'https://a.test/2',
    );
    expect(command.key).toBe('k');
    expect(command.app.redirect).toEqual(['https://a.test/1', 'https://a.test/2']);
  });

  it('reads the other commands', () => {
    expect(parse(['apps', 'list'])).toEqual({ name: 'list', json: false });
    expect(parse(['apps', 'list', '--json'])).toEqual({ name: 'list', json: true });
    expect(parse(['apps', 'rotate-secret', 'k', '--json'])).toEqual({
      name: 'rotate-secret',
      key: 'k',
      json: true,
    });
    expect(parse(['apps', 'remove', 'k'])).toEqual({ name: 'remove', key: 'k' });
  });

  it.each([
    [[]],
    [['apps']],
    [['users', 'list']],
    [['apps', 'frobnicate']],
    [['apps', 'ensure', 'k', '--redirect', 'https://a.test/cb']],
    [['apps', 'ensure', 'k', '--name', 'N']],
    [['apps', 'ensure', '--name', 'N', '--redirect', 'https://a.test/cb']],
    [['apps', 'ensure', 'k', 'j', '--name', 'N', '--redirect', 'https://a.test/cb']],
    [['apps', 'ensure', 'k', '--name', 'N', '--name', 'M', '--redirect', 'https://a.test/cb']],
    [['apps', 'ensure', 'k', '--name', '--redirect', 'https://a.test/cb']],
    [['apps', 'ensure', 'k', '--name', 'N', '--redirect']],
    [['apps', 'ensure', 'k', '--name', 'N', '--redirect', 'https://a.test/cb', '--nope']],
    [['apps', 'ensure', 'k', '--name', 'N', '--redirect', 'https://a.test/cb', '--json=1']],
    [['apps', 'list', 'k']],
    [['apps', 'list', '--name', 'N']],
    [['apps', 'remove']],
    [['apps', 'remove', 'k', '--json']],
    [['apps', 'rotate-secret']],
  ])('refuses %j as a usage error', (argv) => {
    expect(() => parse(argv)).toThrow(UsageError);
  });

  it('asks for the whole of an app, so what is left out is the default and not what was there', () => {
    const { app } = ensure('k', '--name', 'N', '--redirect', 'https://a.test/cb');
    expect(app.hidden).toBe(false);
    expect(inputOf({ ...app, hidden: true }).launcher?.show).toBe(false);
    expect(inputOf(app)).toEqual({
      name: 'N',
      type: 'confidential',
      redirectUris: ['https://a.test/cb'],
      postLogoutRedirectUris: [],
      backchannelLogoutUri: '',
      accountDeletedUri: '',
      scopes: ['openid', 'profile', 'email'],
      appScopes: [],
      trusted: false,
      enabled: true,
      launcher: { description: '', icon: '', launchUrl: '', show: true },
    });
    expect(inputOf({ ...app, isPublic: true }).type).toBe('public');
  });
});
