import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { decryptBytes, encryptBytes, importDocumentKey } from '@sovereignfs/crypto/web';
import { MINIMAL_DOCUMENTS } from '../support/apps';
import { registerApp } from '../support/console';
import { openDatabase } from '../support/database';
import { CORE_URL, MINIMAL_URL, person } from '../support/env';
import { appPage, myKeysOf, release, subOf } from '../support/keys';
import { join, newPerson, signIn } from '../support/ui';
import { world } from '../support/world';

const owner = person('Olive');

/** Whether this browser keeps an account key for its session (core-app §5.4), read from core's own IndexedDB. */
const keepsKey = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const request = indexedDB.open('sovereign-keys', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('keys');
        request.onsuccess = () => {
          const read = request.result.transaction('keys').objectStore('keys').get('account');
          read.onsuccess = () => resolve(read.result !== undefined);
          read.onerror = () => resolve(false);
        };
        request.onerror = () => resolve(false);
      }),
  );

/** The sessions core keeps for an account, newest first, and which of them still have a secret (core-app §5.4). */
async function sessionsOf(email: string) {
  const database = await openDatabase();
  try {
    const rows = (
      await database.run(
        'select s.id, (select count(*) from key_session_secrets k where k.session_id = s.id) as secrets from sessions s join users u on u.id = s.user_id where u.email = ? order by s.created_at desc',
        [email],
      )
    ).rows;
    return rows.map((row) => ({ id: String(row.id), secret: Number(row.secrets) > 0 }));
  } finally {
    await database.close();
  }
}

async function secretsFor(sessionId: string): Promise<number> {
  const database = await openDatabase();
  try {
    return (
      await database.run('select session_id from key_session_secrets where session_id = ?', [
        sessionId,
      ])
    ).rows.length;
  } finally {
    await database.close();
  }
}

/**
 * Staying unlocked ends with the session (core-app §5.4, RFC 0005 §5): a browser keeps the account key wrapped by a secret only the
 * server holds for its session. Its session ended from another browser, while none of its pages was open, that secret is gone from
 * the server, so what the first browser kept opens nothing; its next page finds no session and deletes what it kept.
 */
test('§5.10.4: a session ended from another browser leaves the first browser holding nothing that opens, with no page of it open', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/invites');
  const wanda = person('Wanda');
  const first = await join(browser, operator.page, wanda);
  await operator.context.close();
  await expect.poll(() => keepsKey(first.page)).toBe(true);
  const [firstSession] = await sessionsOf(wanda.email);
  if (!firstSession) throw new Error('no session');
  await expect.poll(() => secretsFor(firstSession.id)).toBe(1);

  // No page of the first browser is open from here on; it keeps only what IndexedDB holds.
  await first.page.close();

  const second = await newPerson(browser);
  await signIn(second.page, wanda, '/security');
  await second.page.getByRole('button', { name: 'Sign out everywhere else' }).click();
  await expect.poll(async () => (await sessionsOf(wanda.email)).length).toBe(1);

  // The server's half is gone with the session: nothing the first browser kept can be opened again.
  expect(await secretsFor(firstSession.id)).toBe(0);
  expect((await sessionsOf(wanda.email)).map((s) => s.id)).not.toContain(firstSession.id);

  // The first browser's next page has no session, and forgets what it kept.
  const back = await first.context.newPage();
  await back.goto(`${CORE_URL}/`);
  await expect(back).toHaveURL(/\/sign-in/);
  await expect.poll(() => keepsKey(back)).toBe(false);
  await first.context.close();
  await second.context.close();
});

/** Every row of every table of core's database, as text: what a backup of it holds. */
async function everyRow(): Promise<string> {
  const database = await openDatabase();
  try {
    const tables =
      database.family === 'postgres'
        ? await database.run(
            'select tablename as name from pg_tables where schemaname = current_schema() order by 1',
          )
        : await database.run(
            "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_litestream%' order by 1",
          );
    const parts: string[] = [];
    for (const table of tables.rows) {
      const rows = await database.run(`select * from "${String(table.name)}"`);
      for (const row of rows.rows) {
        for (const value of Object.values(row)) {
          parts.push(
            value instanceof Uint8Array ? Buffer.from(value).toString('latin1') : String(value),
          );
        }
      }
    }
    return parts.join('\n');
  } finally {
    await database.close();
  }
}

/** The SQLite file and its journal, byte for byte, when the run is on a SQLite file: free pages and the journal included. */
function sqliteFiles(): Buffer[] {
  const variables = world.get<Record<string, string>>('database');
  const url = variables.SV_SQLITE_URL;
  if (variables.SV_DB_DIALECT !== 'sqlite' || !url) return [];
  const file = url.replace(/^file:/, '');
  return [file, `${file}-wal`, `${file}-journal`]
    .filter((each) => existsSync(each))
    .map((each) => readFileSync(each));
}

/** What the app's server keeps on disk. */
function appFiles(): Buffer[] {
  if (!existsSync(MINIMAL_DOCUMENTS)) return [];
  return readdirSync(MINIMAL_DOCUMENTS).map((name) =>
    readFileSync(path.join(MINIMAL_DOCUMENTS, name)),
  );
}

/** A value as it could be written down: as it is, and in the encodings a record or a log might carry it in. */
const forms = (value: string): string[] => {
  const bytes = Buffer.from(value, 'utf8');
  return [value, bytes.toString('base64'), bytes.toString('base64url'), bytes.toString('hex')];
};

/**
 * No plaintext on the server (core-app §5.10.8, RFC 0005 Testing): a person writes a document in an encrypted app, with the app key
 * core released to its page, and the app's server stores what the page sends. Read back and opened, it is the document; but neither
 * core's database (every row of every table, which is what a backup of it holds, and the SQLite file itself on that dialect) nor the
 * app's stored files hold its text, its name or its type, in any encoding.
 */
test('§5.10.8: the test instance’s database, files and backup hold no plaintext of a document, its name or its type', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/apps');
  const returnTo = `${MINIMAL_URL}/keys/notes`;
  const notes = await registerApp(operator.page, {
    name: 'Notes',
    launchUrl: `${MINIMAL_URL}/notes`,
    redirectUri: `${MINIMAL_URL}/notes/callback`,
    kind: 'public',
    scopes: [],
    keyReturnUri: returnTo,
  });
  const writer = person('Xena');
  const joined = await join(browser, operator.page, writer);
  await operator.context.close();
  const sub = await subOf(writer.email);
  const app = appPage(notes.id, returnTo, sub);
  app.bar.hash = await release(joined.page, app, returnTo);
  expect((await app.keys.receive()).ok).toBe(true);
  const opened = await app.keys.open();
  if (opened.state !== 'open') throw new Error('locked');
  const me = await myKeysOf(sub, notes.id);
  const identity = await app.keys.identity(opened.key, me);
  if (!identity.ok) throw new Error(identity.reason);
  await joined.context.close();

  const marker = crypto.randomUUID().replaceAll('-', '');
  const text = `Minutes of the board, never to be read by the server ${marker}`;
  const name = `board-minutes-${marker}.txt`;
  const type = `application/x-sovereign-secret-${marker}`;

  // The page: a document key, the text and its name and type encrypted with it, and the key sealed to the writer, then all of it
  // sent to the app's server.
  const documentKey = app.keys.newDocumentKey();
  const contentKey = await importDocumentKey(documentKey);
  const body = await encryptBytes(
    contentKey,
    { documentId: 'note-1', version: 1 },
    Buffer.from(text, 'utf8'),
  );
  const meta = await encryptBytes(
    contentKey,
    { documentId: 'note-1/meta', version: 1 },
    Buffer.from(JSON.stringify({ name, type }), 'utf8'),
  );
  const sealed = await app.keys.share({
    documentKey,
    documentId: 'note-1',
    to: { ...me, checked: true },
    identity: identity.identity,
  });
  documentKey.fill(0);
  for (const [id, bytes] of [
    ['note-1', body],
    ['note-1-meta', meta],
    ['note-1-key', Buffer.from(JSON.stringify(sealed), 'utf8')],
  ] as const) {
    const stored = await fetch(`${MINIMAL_URL}/documents/${id}`, {
      method: 'PUT',
      body: Buffer.from(bytes),
    });
    expect(stored.status).toBe(204);
  }

  // Read back from the app's server, it opens to the document: the scan below is of a real document's storage.
  const fetched = async (id: string) =>
    new Uint8Array(await (await fetch(`${MINIMAL_URL}/documents/${id}`)).arrayBuffer());
  const key = await app.keys.openShared({
    record: JSON.parse(Buffer.from(await fetched('note-1-key')).toString('utf8')),
    documentId: 'note-1',
    me,
    from: { ...me, checked: true },
    identity: identity.identity,
  });
  const reopened = await importDocumentKey(key);
  expect(
    Buffer.from(
      await decryptBytes(reopened, { documentId: 'note-1', version: 1 }, await fetched('note-1')),
    ).toString('utf8'),
  ).toBe(text);
  expect(
    JSON.parse(
      Buffer.from(
        await decryptBytes(
          reopened,
          { documentId: 'note-1/meta', version: 1 },
          await fetched('note-1-meta'),
        ),
      ).toString('utf8'),
    ),
  ).toEqual({ name, type });

  // The server's side: core's database row by row, the SQLite file itself on that dialect, and the app's files.
  const rows = await everyRow();
  const files = [...sqliteFiles(), ...appFiles()];
  expect(appFiles()).toHaveLength(3);
  for (const secret of [text, name, type, marker]) {
    for (const form of forms(secret)) {
      expect(rows.includes(form), `core's database holds ${secret}`).toBe(false);
      for (const file of files) {
        expect(file.includes(Buffer.from(form, 'utf8')), `a stored file holds ${secret}`).toBe(
          false,
        );
      }
    }
  }
});
