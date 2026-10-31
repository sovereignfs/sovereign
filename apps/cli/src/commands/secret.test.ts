import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateX25519Identity, identityToRecipient } from 'age-encryption';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readOperatorKey } from '../secrets/keys.js';
import { decryptValue, encryptValue, type SecretsDocument } from '../secrets/store.js';
import type { Suite } from '../suite/types.js';
import { NOTES_IMAGE, setUpWorld, sv } from '../testing/commands.js';
import { makeWorld, manifestOf, type World } from '../testing/world.js';

let world: World;
afterEach(() => world.cleanup());
const file = (name: string) => readFileSync(path.join(world.root, name), 'utf8');
const secrets = () => parse(file('secrets.age.yml')) as SecretsDocument;
const setup = async (options: Parameters<typeof makeWorld>[0] = {}) => {
  world = makeWorld({ images: { [NOTES_IMAGE]: { manifest: manifestOf() } }, ...options });
  await setUpWorld(world);
  await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
};

describe('sv secret set', () => {
  it('reads the value from standard input when there is no terminal, and writes only ciphertext', async () => {
    await setup({ stdin: 's3cret-value\n' });
    const done = await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD');
    expect(done.code).toBe(0);
    expect(file('secrets.age.yml')).not.toContain('s3cret-value');
    expect(file('secrets.age.yml')).toContain('BEGIN AGE ENCRYPTED FILE');
    expect(done.text).not.toContain('s3cret-value');
    const key = await readOperatorKey(world.ctx.keyFile);
    expect(await decryptValue(secrets().core?.SV_SMTP_PASSWORD ?? '', key?.identity ?? '')).toBe(
      's3cret-value',
    );
  });

  it('asks for the value hidden when there is a terminal, and never shows it', async () => {
    await setup({ interactive: true, hidden: ['typed-in-secret'] });
    world.said.answers.push();
    const done = await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD');
    expect(done.code).toBe(0);
    expect(world.asked.join('\n')).toContain('Value for SV_SMTP_PASSWORD (hidden)');
    expect(file('secrets.age.yml')).not.toContain('typed-in-secret');
    expect(done.text).not.toContain('typed-in-secret');
  });

  it('does not take the value as an argument', async () => {
    await setup({ stdin: 'x' });
    const done = await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD', 'oops-on-the-command-line');
    expect(done.code).toBe(2);
    expect(done.text).toContain('Usage: sv secret set NAME');
    expect(file('suite.yml')).not.toContain('oops-on-the-command-line');
  });

  it('is encrypted to every recipient, so a second operator can read it', async () => {
    await setup({ stdin: 'shared' });
    const second = await generateX25519Identity();
    const suite = parse(file('suite.yml')) as Suite;
    writeFileSync(
      path.join(world.root, 'suite.yml'),
      file('suite.yml').replace(
        `- ${suite.secrets.recipients[0]}`,
        `- ${suite.secrets.recipients[0]}\n    - ${await identityToRecipient(second)}`,
      ),
    );
    await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD');
    expect(await decryptValue(secrets().core?.SV_SMTP_PASSWORD ?? '', second)).toBe('shared');
  });

  it('refuses an empty value, and changes nothing', async () => {
    await setup({ stdin: '\n' });
    expect((await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD')).text).toContain(
      'The value is empty',
    );
  });

  it.each([
    ['SV_AUTH_SECRET', undefined, 'made or refused by the deployment'],
    ['SV_POSTGRES_URL_FILE', undefined, 'made or refused by the deployment'],
    ['SMTP_PASSWORD', undefined, 'begins with SV_'],
    ['lower', undefined, 'not a variable name'],
    ['NOTES_API_KEY', 'missing', 'not an app in suite.yml'],
    ['OTHER_API_KEY', 'notes', 'begins with NOTES_'],
    ['NOTES_CORE_CLIENT_SECRET', 'notes', 'given to notes by the deployment'],
    ['NOTES_AUTH_SECRET', 'notes', 'given to notes by the deployment'],
  ])('refuses %s for %s: %s', async (name, app, message) => {
    await setup({ stdin: 'v' });
    const done = await sv(world, 'secret', 'set', name, ...(app ? ['--app', app] : []));
    expect(done.code).toBe(2);
    expect(done.text).toContain(message);
  });

  it('sets a secret for a hosted app under its manifest’s prefix, and refuses one for an external app', async () => {
    await setup({ stdin: 'k' });
    expect((await sv(world, 'secret', 'set', 'NOTES_API_KEY', '--app', 'notes')).code).toBe(0);
    expect(Object.keys(secrets().notes ?? {})).toEqual(['NOTES_API_KEY']);
    await sv(
      world,
      'app',
      'add',
      'wiki',
      '--external',
      '--name',
      'W',
      '--redirect',
      'https://w.example.com/cb',
    );
    expect((await sv(world, 'secret', 'set', 'WIKI_X', '--app', 'wiki')).text).toContain(
      'external app',
    );
  });
});

describe('sv secret remove and list', () => {
  it('lists names and never values, as text and as a document', async () => {
    await setup({ stdin: 'v' });
    await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD');
    await sv(world, 'secret', 'set', 'NOTES_API_KEY', '--app', 'notes');
    const text = await sv(world, 'secret', 'list');
    expect(text.out).toEqual(['core\tSV_SMTP_PASSWORD', 'notes\tNOTES_API_KEY']);
    const json = await sv(world, 'secret', 'list', '--json');
    expect(JSON.parse(json.out.join(''))).toEqual({
      secrets: [
        { owner: 'core', name: 'SV_SMTP_PASSWORD' },
        { owner: 'notes', name: 'NOTES_API_KEY' },
      ],
    });
    expect(`${text.text}${json.text}`).not.toContain('BEGIN AGE');
  });

  it('removes one, and says when there is none to remove', async () => {
    await setup({ stdin: 'v' });
    await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD');
    expect((await sv(world, 'secret', 'remove', 'SV_SMTP_PASSWORD')).code).toBe(0);
    expect((await sv(world, 'secret', 'list')).out).toEqual([
      'No secrets. sv secret set adds one.',
    ]);
    expect((await sv(world, 'secret', 'remove', 'SV_SMTP_PASSWORD')).text).toContain(
      'has no secret called',
    );
  });
});

describe('sv secret rekey', () => {
  it('encrypts everything again to the recipients now in suite.yml, and says what that does not undo', async () => {
    await setup({ stdin: 'v' });
    await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD');
    const second = await generateX25519Identity();
    const suite = parse(file('suite.yml')) as Suite;
    writeFileSync(
      path.join(world.root, 'suite.yml'),
      file('suite.yml').replace(
        `- ${suite.secrets.recipients[0]}`,
        `- ${suite.secrets.recipients[0]}\n    - ${await identityToRecipient(second)}`,
      ),
    );
    const done = await sv(world, 'secret', 'rekey');
    expect(done.code).toBe(0);
    expect(done.text).toContain('Re-encrypted 1 secret to 2 recipients');
    expect(done.text).toContain('does not take back what they could already read');
    expect(await decryptValue(secrets().core?.SV_SMTP_PASSWORD ?? '', second)).toBe('v');
  });

  it('refuses when this machine\u2019s key is not a recipient of a secret', async () => {
    await setup({ stdin: 'v' });
    const other = await identityToRecipient(await generateX25519Identity());
    const armored = await encryptValue('theirs', [other]);
    const indented = armored
      .trimEnd()
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');
    writeFileSync(
      path.join(world.root, 'secrets.age.yml'),
      `core:\n  SV_SMTP_PASSWORD: |\n${indented}\n`,
    );
    const done = await sv(world, 'secret', 'rekey');
    expect(done.code).toBe(2);
    expect(done.text).toContain('Your key cannot decrypt this secret');
  });

  it('says rotate needs the server', async () => {
    await setup();
    expect((await sv(world, 'secret', 'rotate', 'notes')).code).toBe(2);
  });
});
