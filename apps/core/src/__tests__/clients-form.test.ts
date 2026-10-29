import { describe, expect, it } from 'vitest';
import { appFromForm, fieldProblems, lines, newAppFromForm, SCOPE_TEXT } from '../clients/form';
import { OAUTH_SCOPES } from '../oauth/provider';

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
};

describe('lines of addresses', () => {
  it('trims each, drops the empty ones, and reads either kind of line break', () => {
    expect(lines('  https://a.example/cb \r\n\n https://b.example/cb\n   \n')).toEqual([
      'https://a.example/cb',
      'https://b.example/cb',
    ]);
  });

  it('is nothing for an empty box, nothing sent, or a file', () => {
    expect(lines('')).toEqual([]);
    expect(lines(null)).toEqual([]);
    expect(lines(new File(['x'], 'x.txt'))).toEqual([]);
  });
});

describe('what an app form sends, as the registry takes it', () => {
  it('sends every field, so a save sets the app to what the form showed', () => {
    const input = appFromForm(
      form([
        ['name', 'Notes'],
        ['redirectUris', 'https://notes.example/cb'],
        ['postLogoutRedirectUris', 'https://notes.example/bye\nhttps://notes.example/out'],
        ['backchannelLogoutUri', ' https://notes.example/logout '],
        ['endSession', 'on'],
        ['scope', 'openid'],
        ['scope', 'email'],
        ['trusted', 'on'],
        ['description', 'Take notes'],
        ['icon', ''],
        ['launchUrl', 'https://notes.example'],
        ['show', 'on'],
      ]),
    );
    expect(input).toEqual({
      name: 'Notes',
      redirectUris: ['https://notes.example/cb'],
      postLogoutRedirectUris: ['https://notes.example/bye', 'https://notes.example/out'],
      backchannelLogoutUri: 'https://notes.example/logout',
      endSession: true,
      scopes: ['openid', 'email'],
      trusted: true,
      launcher: {
        description: 'Take notes',
        icon: '',
        launchUrl: 'https://notes.example',
        show: true,
      },
    });
  });

  it('reads a box that was not ticked as off, and an empty address as clearing it', () => {
    const input = appFromForm(
      form([
        ['name', 'Notes'],
        ['backchannelLogoutUri', ''],
      ]),
    );
    expect(input).toMatchObject({
      endSession: false,
      trusted: false,
      scopes: [],
      backchannelLogoutUri: '',
      launcher: { show: false, launchUrl: '', icon: '' },
    });
  });

  it('never takes the trust or a scope from anything but its own field', () => {
    const data = new FormData();
    data.set('trusted', 'yes');
    data.set('scope', new File(['x'], 'x'));
    expect(appFromForm(data).trusted).toBe(false);
  });

  it('makes a new app confidential unless it says public', () => {
    expect(newAppFromForm(form([['name', 'A']])).type).toBe('confidential');
    expect(
      newAppFromForm(
        form([
          ['name', 'A'],
          ['type', 'public'],
        ]),
      ).type,
    ).toBe('public');
    expect(
      newAppFromForm(
        form([
          ['name', 'A'],
          ['type', 'whatever'],
        ]),
      ).type,
    ).toBe('confidential');
  });
});

describe('what the scopes are called', () => {
  it('has words for every scope core offers, and locks the one every app needs', () => {
    expect(Object.keys(SCOPE_TEXT).sort()).toEqual([...OAUTH_SCOPES].sort());
    expect(SCOPE_TEXT.openid?.locked).toBe(true);
    expect(Object.values(SCOPE_TEXT).filter((text) => text.locked)).toHaveLength(1);
  });
});

describe('what was wrong, beside the field it belongs to', () => {
  it('names the field a form shows, as a sentence', () => {
    expect(
      fieldProblems([
        { field: 'name', message: 'is required' },
        { field: 'redirectUris', message: 'address 2 must be https' },
        { field: 'launcher.launchUrl', message: 'is not an address' },
        { field: 'scopes', message: 'must include openid' },
      ]),
    ).toEqual({
      name: 'The name is required.',
      redirectUris: 'Address 2 must be https.',
      launchUrl: 'The launch address is not an address.',
      scope: 'What the app may see must include openid.',
    });
  });

  it('puts several problems with one field together', () => {
    expect(
      fieldProblems([
        { field: 'redirectUris', message: 'address 1 is not an address' },
        { field: 'redirectUris', message: 'address 2 is listed twice' },
      ]).redirectUris,
    ).toBe('Address 1 is not an address. Address 2 is listed twice.');
  });

  it('keeps a problem with a field it does not know, under that name', () => {
    expect(fieldProblems([{ field: 'odd', message: 'is odd' }])).toEqual({ odd: 'This is odd.' });
  });
});
