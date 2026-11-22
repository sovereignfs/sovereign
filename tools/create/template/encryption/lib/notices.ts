import { coreNotices, userIdForSub } from '@sovereignfs/auth/core';
import pkg from '../package.json' with { type: 'json' };
import { required } from './config';
import { db } from './db';
import { files } from './files';
import { notes } from './notes';
import { pushStore } from './push';
import { signIn } from './sign-in';
import { sovereign } from './sovereign';
import { tokenStore } from './stores';

/**
 * Core's two notices (auth.md §8): a logout ends this app's sessions of that core session, or of that person; an account deleted at the
 * instance deletes the person here first, and core keeps telling the app until it has. It must be safe to run twice. Everything of a
 * person here is kept under core's `sub` for them, as their keys are.
 */
export async function notices() {
  const { auth, database } = await signIn();
  return coreNotices({
    database,
    auth,
    coreUrl: required('__PREFIX___CORE_URL'),
    clientId: required('__PREFIX___CORE_CLIENT_ID'),
    dropRefreshToken: async (sub) => {
      await tokenStore.delete?.(sub);
    },
    onAccountDeleted: async (sub) => {
      // Their notes and the keys sealed to them for others' notes (RFC 0005 §8): with the keys gone, nothing of theirs opens.
      await notes().deleteAll(sub);
      // And the files they uploaded: their folder, which is gone once this has run, however often it does.
      await files().removeAll(sub);
      // And the devices they get notifications on, with what was waiting for them.
      await pushStore().removeAccount(sub);
      const userId = await userIdForSub(database, sub);
      if (userId) await (await auth.$context).internalAdapter.deleteUser(userId);
    },
  });
}

/**
 * Core's request for a person's part of their export from the instance (core-app §4.7.2): their notes as stored, still encrypted, and
 * the keys sealed to them, so the export opens with their own keys and nobody else's; and their files. A person with nothing here gets an
 * empty part.
 */
export async function exportPart(request: Request) {
  return sovereign().auth.handleExportRequest(
    request,
    { prefix: '__PREFIX_LOWER__', version: pkg.version },
    async ({ sub, writer }) => {
      const owned = await db().query(
        "SELECT id, version, encode(meta, 'base64') AS meta, encode(body, 'base64') AS body, updated_at FROM notes WHERE owner = $1 ORDER BY id",
        [sub],
      );
      await writer.addRecords('apps/__PREFIX_LOWER__/records/notes.jsonl', 'notes', owned.rows, {
        endToEnd: true,
      });
      const readers = await db().query(
        'SELECT * FROM note_readers WHERE reader = $1 ORDER BY note_id',
        [sub],
      );
      await writer.addRecords(
        'apps/__PREFIX_LOWER__/records/note_readers.jsonl',
        'note_readers',
        readers.rows,
        { endToEnd: true },
      );
      const kept = await files().list(sub);
      await writer.addRecords('apps/__PREFIX_LOWER__/records/files.jsonl', 'files', kept);
      for (const record of kept) {
        const { body } = await files().get(sub, record.id);
        await writer.addFile(`apps/__PREFIX_LOWER__/files/${record.id}`, body, record.size);
      }
    },
  );
}
